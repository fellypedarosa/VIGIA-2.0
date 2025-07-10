from flask import Flask, Response, jsonify, request, g
from flask_cors import CORS, cross_origin
from flask_bcrypt import Bcrypt
import cv2
import time
import threading
import base64
import json
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.image import MIMEImage
from email.mime.multipart import MIMEMultipart
import random
from flask_jwt_extended import create_access_token, jwt_required, JWTManager, get_jwt_identity
import sqlite3
import secrets

app = Flask(__name__)
CORS(app)
bcrypt = Bcrypt(app)

# Configuração do Flask-JWT-Extended
jwt_secret = os.environ.get("JWT_SECRET_KEY")
if not jwt_secret:
    raise RuntimeError("A variável de ambiente JWT_SECRET_KEY não está definida!")
app.config["JWT_SECRET_KEY"] = jwt_secret
jwt = JWTManager(app)

# --- Estado Global Compartilhado ---
camera_thread = None
monitoring_active = False
processing_paused = False
latest_frame = None
recent_alerts = []
ALERT_THRESHOLD = 10
frame_lock = threading.Lock()
alerts_lock = threading.Lock()
config_lock = threading.Lock()

# --- Configuração de E-mail de Recuperação ---
CONFIG_FILE = 'config.json'
def load_config():
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, 'r') as f:
            return json.load(f)
    return {}

def save_config(config):
    with open(CONFIG_FILE, 'w') as f:
        json.dump(config, f, indent=4)

# Carregar configuração inicial
app_config = load_config()
RECOVERY_EMAIL = os.environ.get('RECOVERY_EMAIL')
SMTP_SERVER = os.environ.get('SMTP_SERVER')
SMTP_PORT = int(os.environ.get('SMTP_PORT', '465'))
SMTP_USER = os.environ.get('SMTP_USER')
SMTP_PASSWORD = os.environ.get('SMTP_PASSWORD')

# --- Variáveis para Recuperação de Senha ---
# password_reset_codes = {} # Não precisamos mais deste dicionário em memória

# --- Configuração do Banco de Dados SQLite ---
DATABASE = 'vigia.db' # Caminho do banco de dados dentro do diretório de trabalho /app

def get_db():
    db = getattr(g, '_database', None)
    if db is None:
        db = g._database = sqlite3.connect(DATABASE)
        db.row_factory = sqlite3.Row # Permite acessar colunas por nome
    return db

@app.teardown_appcontext
def close_db(error):
    db = getattr(g, '_database', None)
    if db is not None:
        db.close()

def init_db():
    with app.app_context():
        db = get_db()
        with app.open_resource('schema.sql', mode='r') as f:
            db.cursor().executescript(f.read())
        db.commit()

# Função auxiliar para executar queries no banco
def query_db(query, args=(), one=False):
    cur = get_db().execute(query, args)
    rv = cur.fetchall()
    cur.close()
    return (rv[0] if rv else None) if one else rv

# Função para adicionar um usuário inicial (para demonstração)
def add_initial_user():
    with app.app_context():
        db = get_db()
        existing_user = query_db('SELECT * FROM users WHERE username = ?', ('admin',), one=True)
        if existing_user is None:
            # Hash da senha inicial antes de armazenar
            hashed_password = bcrypt.generate_password_hash('testpassword').decode('utf-8')
            query_db('INSERT INTO users (username, password) VALUES (?, ?)', ('admin', hashed_password))
            db.commit()
            print("Usuário inicial 'admin' adicionado ao banco de dados com senha hashed.")

# Inicializa o banco de dados na primeira execução
# TODO: Em produção, gerenciar migrações de schema adequadamente
# Adicionar chamadas para inicializar o banco e adicionar usuário inicial
with app.app_context():
    db = get_db()
    cursor = db.cursor()
    # Verifica se a tabela 'users' existe. Se não, inicializa o banco.
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='users';")
    if cursor.fetchone() is None:
        print("Banco de dados não inicializado. Executando schema.sql...")
        init_db()
        add_initial_user()
    else:
        print("Banco de dados já inicializado.")

# --------------------------------

class CameraThread(threading.Thread):
    def __init__(self):
        super().__init__()
        self.daemon = True
        self.camera = None
        self.last_frame_gray = None
        self.last_alert_time = 0
        self.ALERT_COOLDOWN = 5 # Segundos de espera entre alertas

    def run(self):
        global monitoring_active, processing_paused, latest_frame, recent_alerts, frame_lock, alerts_lock, ALERT_THRESHOLD, config_lock

        print("Thread da câmera iniciado.")
        self.camera = cv2.VideoCapture(0)
        if not self.camera.isOpened():
            print("Erro: Thread da câmera não conseguiu abrir a câmera.")
            monitoring_active = False
            return

        while monitoring_active:
            ret, frame = self.camera.read()
            if not ret:
                print("Erro: Falha ao ler o frame da câmera.")
                time.sleep(0.1)
                continue

            # Atualiza o frame para o /video_feed IMEDIATAMENTE após a leitura
            with frame_lock:
                latest_frame = frame.copy()

            # Verifica se o processamento está pausado
            with config_lock:
                if processing_paused:
                    self.last_frame_gray = None # Reseta o frame de referência ao pausar
                    time.sleep(0.05)
                    continue # Pula a detecção e alerta se pausado

            # Continue with motion detection processing on the captured frame
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            gray = cv2.GaussianBlur(gray, (21, 21), 0)

            if self.last_frame_gray is None:
                self.last_frame_gray = gray
                time.sleep(0.05)
                continue

            frame_delta = cv2.absdiff(self.last_frame_gray, gray)
            thresh = cv2.threshold(frame_delta, 25, 255, cv2.THRESH_BINARY)[1]
            thresh = cv2.dilate(thresh, None, iterations=2)
            contours, _ = cv2.findContours(thresh.copy(), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

            max_motion_score = 0
            motion_detected = False
            for contour in contours:
                if cv2.contourArea(contour) < 500:
                    continue
                motion_detected = True
                (x, y, w, h) = cv2.boundingRect(contour)
                cv2.rectangle(frame, (x, y), (x + w, y + h), (0, 255, 0), 2)
                current_score = cv2.contourArea(contour)
                if current_score > max_motion_score:
                    max_motion_score = current_score

            self.last_frame_gray = gray

            normalized_score = min(round((max_motion_score / 50000) * 100), 100)

            # Added debug log for motion scores
            if motion_detected:
                 print(f"DEBUG Movimento Detectado: Max Score = {max_motion_score}, Normalized Score = {normalized_score}")

            # Se o score ultrapassar o limite definido pelo usuário e o cooldown tiver passado, gera um alerta
            current_time = time.time()
            with config_lock:
                current_threshold = ALERT_THRESHOLD

            if motion_detected and normalized_score >= current_threshold and (current_time - self.last_alert_time) > self.ALERT_COOLDOWN:
                self.last_alert_time = current_time
                print(f"ALERTA GERADO! Score: {normalized_score} (Limite: {current_threshold})")

                # Codifica a imagem do alerta para base64
                _, buffer = cv2.imencode('.jpg', frame)
                jpg_as_text = base64.b64encode(buffer).decode('ascii')

                alert_data = {
                    "image": f"data:image/jpeg;base64,{jpg_as_text}",
                    "score": normalized_score,
                    "timestamp": int(current_time * 1000)
                }

                # Add alert data to recent_alerts for frontend display
                with alerts_lock:
                    recent_alerts.append(alert_data)

                # Envia o e-mail de alerta diretamente em uma nova thread
                print("DEBUG: Tentando enviar alerta por email diretamente.")
                try:
                    email_thread = threading.Thread(target=send_email_alert, args=(alert_data,))
                    email_thread.start()
                    print("DEBUG: Thread para envio de e-mail de alerta iniciada.")
                except Exception as e:
                    print(f"DEBUG: Erro ao iniciar a thread de envio de e-mail: {e}")

            # Removed time.sleep(0.02) here

        self.camera.release()
        print("Thread da câmera finalizado e câmera liberada.")

@app.route('/video_feed')
@jwt_required()
def video_feed():
    def generate():
        global latest_frame, frame_lock, monitoring_active
        while monitoring_active:
            with frame_lock:
                if latest_frame is None:
                    time.sleep(0.01) # Reduced sleep slightly while waiting for frame
                    continue
                ret, buffer = cv2.imencode('.jpg', latest_frame)
                if not ret:
                    continue
                frame_bytes = buffer.tobytes()

            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
            # Removed time.sleep(0.05) here to improve frame rate on frontend

    if not monitoring_active:
        return Response("Monitoramento não ativo.", status=400)
    return Response(generate(), mimetype='multipart/x-mixed-replace; boundary=frame')


# Endpoint para o frontend verificar se há novos alertas
@app.route('/check_alerts')
@jwt_required()
def check_alerts():
    global recent_alerts, alerts_lock
    alerts_to_send = []
    with alerts_lock:
        if recent_alerts:
            alerts_to_send = recent_alerts.copy()
            recent_alerts.clear()
    
    return jsonify({"alerts": alerts_to_send})

@app.route('/login', methods=['POST'])
def login():
    print("DEBUG: Endpoint /login recebido")
    if not request.is_json:
        print("DEBUG: /login - Missing JSON in request")
        return jsonify({"msg": "Missing JSON in request"}), 400

    username = request.json.get('username', None)
    password = request.json.get('password', None)

    if not username or not password:
        print("DEBUG: /login - Missing username or password")
        return jsonify({"msg": "Missing username or password"}), 400

    # --- Verificar credenciais no banco de dados ----
    # Recupera o usuário pelo nome de usuário
    user = query_db('SELECT * FROM users WHERE username = ?', (username,), one=True)

    print(f"DEBUG: Usuário recuperado do DB para {username}: {user}") # Log do usuário recuperado

    # Verifica se o usuário existe e se a senha fornecida corresponde ao hash armazenado
    if user and bcrypt.check_password_hash(user['password'], password):
        print(f"DEBUG: Login bem-sucedido para o usuário {username}")
        access_token = create_access_token(identity=username)
        return jsonify(access_token=access_token)
    else:
        print(f"DEBUG: Login falhou para o usuário {username}. Credenciais inválidas.")
        return jsonify({"msg": "Bad username or password"}), 401

@app.route('/pause_monitoring')
@jwt_required()
def pause_monitoring():
    global processing_paused, config_lock
    with config_lock:
        processing_paused = True
    print("Processamento de monitoramento pausado no backend.")
    return jsonify({'status': 'Processamento pausado'})

@app.route('/resume_monitoring')
@jwt_required()
def resume_monitoring():
    global processing_paused, config_lock
    with config_lock:
        processing_paused = False
    print("Processamento de monitoramento retomado no backend.")
    return jsonify({'status': 'Processamento retomado'})

@app.route('/start_monitoring')
@jwt_required()
def start_monitoring():
    global monitoring_active, processing_paused, camera_thread
    if monitoring_active:
        return jsonify({'status': 'Monitoramento já está ativo'})

    # Tentar liberar a câmera antes de iniciar, caso não tenha sido liberada corretamente
    if camera_thread is not None:
        camera_thread.join()
        camera_thread = None

    monitoring_active = True
    processing_paused = False # Garante que não comece pausado
    camera_thread = CameraThread()
    camera_thread.start()
    print("Monitoramento iniciado no backend.")
    return jsonify({'status': 'Monitoramento iniciado'})

@app.route('/stop_monitoring')
@jwt_required()
def stop_monitoring():
    global monitoring_active, processing_paused, camera_thread
    if not monitoring_active:
        return jsonify({'status': 'Monitoramento não está ativo'})

    monitoring_active = False
    processing_paused = False # Garante que o processamento não fique pausado ao parar
    if camera_thread:
        camera_thread.join()
    print("Monitoramento parado no backend.")
    return jsonify({'status': 'Monitoramento parado'})

@app.route('/set_threshold', methods=['POST'])
@jwt_required()
def set_threshold():
    global ALERT_THRESHOLD, config_lock
    if not request.json or 'threshold' not in request.json:
        return jsonify({"error": "Missing threshold value"}), 400
    
    try:
        new_threshold = int(request.json['threshold'])
        if not 0 <= new_threshold <= 100:
            raise ValueError("Threshold must be between 0 and 100")
        
        with config_lock:
            ALERT_THRESHOLD = new_threshold
        
        print(f"Limite de alerta atualizado para: {new_threshold}%")
        return jsonify({"status": "Threshold updated", "new_threshold": new_threshold})
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid threshold value"}), 400

@app.route('/get_recovery_email', methods=['GET'])
@jwt_required()
def get_recovery_email():
    global RECOVERY_EMAIL
    return jsonify({'recovery_email': RECOVERY_EMAIL})

@app.route('/update_recovery_email', methods=['POST'])
@jwt_required()
def update_recovery_email():
    global RECOVERY_EMAIL, app_config
    if not request.json or 'email' not in request.json:
        return jsonify({"error": "Missing email value"}), 400
    
    new_email = request.json['email']
    # Adicionar validação básica de formato de e-mail aqui se necessário
    
    RECOVERY_EMAIL = new_email
    app_config['recovery_email'] = new_email
    save_config(app_config)
    
    print(f"E-mail de recuperação atualizado para: {new_email}")
    return jsonify({"status": "Recovery email updated", "new_email": new_email})

@app.route('/request_password_reset', methods=['POST'])
def request_password_reset():
    global RECOVERY_EMAIL
    if not request.json or 'username' not in request.json:
        return jsonify({"error": "Missing username"}), 400
    
    username = request.json['username']
    
    # Verificar se o username existe no banco de dados de usuários
    user = query_db('SELECT * FROM users WHERE username = ?', (username,), one=True)
    if user is None:
        print(f"DEBUG: Tentativa de recuperação de senha para usuário desconhecido: {username}")
        return jsonify({"error": "User not found"}), 404

    if RECOVERY_EMAIL is None:
        return jsonify({"error": "Recovery email not configured"}), 400
        
    # Gerar código de recuperação de 6 dígitos
    code = str(random.randint(100000, 999999)) # Gera um código numérico de 6 dígitos
    expiration_time = int(time.time()) + 60 # Token válido por 60 segundos

    # Armazenar o código no banco de dados
    db = get_db()
    # Remover tokens antigos ou expirados para este usuário (opcional, mas limpa o banco)
    query_db('DELETE FROM password_reset_tokens WHERE username = ? OR timestamp < ?', (username, int(time.time()) - 60))
    query_db('INSERT INTO password_reset_tokens (username, token, timestamp, used) VALUES (?, ?, ?, ?)',
             (username, code, int(time.time()), 0)) # Armazena o código de 6 dígitos na coluna 'token'
    db.commit()

    # Send recovery email using the new send_email_alert function
    try:
        # Prepare data for the send_email_alert function
        email_data = {
            'subject': "Código de Recuperação de Senha Vigia",
            # Incluir o token no corpo do email. Em um app real, seria um link com o token.
            'body': f"Seu código de recuperação de senha é: {code}",
            'to_email': RECOVERY_EMAIL # Use the configured recovery email
        }
        # Use a separate thread to send the email to avoid blocking
        email_thread = threading.Thread(target=send_email_alert_recovery, args=(email_data,))
        email_thread.start()

        print(f"E-mail de recuperação enviado para {RECOVERY_EMAIL} com token: {code}")
        return jsonify({"status": "Recovery token sent"})
    except Exception as e:
        print(f"Erro ao enviar e-mail de recuperação: {e}")
        return jsonify({"error": "Failed to send recovery email"}), 500



def send_email_alert(alert_data):
    print("DEBUG: Função send_email_alert iniciada") # Added debug log
    recovery_email = RECOVERY_EMAIL
    smtp_server = SMTP_SERVER
    smtp_port = SMTP_PORT
    smtp_user = SMTP_USER
    smtp_password = SMTP_PASSWORD

    if not all([recovery_email, smtp_server, smtp_port, smtp_user, smtp_password]):
        print("DEBUG: send_email_alert - Configurações de SMTP ou e-mail de recuperação incompletas.")
        return False

    try:
        print("DEBUG: send_email_alert - Tentando enviar email via SMTP")
        msg = MIMEMultipart()
        msg['Subject'] = "Alerta de Segurança - Movimento Detectado"
        msg['From'] = smtp_user
        msg['To'] = recovery_email

        body = f"Movimento detectado com intensidade de {alert_data['score']}% às {time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(alert_data['timestamp'] / 1000))}"
        msg.attach(MIMEText(body, 'plain'))

        # Anexar imagem, se disponível
        if alert_data.get('image') and alert_data['image'].startswith('data:image/'):
            try:
                print("DEBUG: send_email_alert - Processando imagem para anexo")
                img_data = alert_data['image'].split(',')[1]
                img_binary = base64.b64decode(img_data)
                image = MIMEImage(img_binary, _subtype='jpeg')
                image.add_header('Content-Disposition', 'attachment', filename='alerta.jpg')
                msg.attach(image)
                print("DEBUG: send_email_alert - Imagem processada e anexada")
            except Exception as e:
                print(f"DEBUG: send_email_alert - Erro ao processar imagem para e-mail: {e}")

        if smtp_port == 465:
            server = smtplib.SMTP_SSL(smtp_server, smtp_port)
        else:
            server = smtplib.SMTP(smtp_server, smtp_port)
            server.starttls()

        server.login(smtp_user, smtp_password)
        text = msg.as_string()
        server.sendmail(smtp_user, recovery_email, text)
        server.quit()

        print(f"DEBUG: send_email_alert - E-mail de alerta enviado para {recovery_email}")
        return True

    except Exception as e:
        print(f"DEBUG: send_email_alert - Erro ao enviar e-mail de alerta: {e}")
        return False

# Add a new function specifically for sending recovery emails
def send_email_alert_recovery(email_data):
    print("DEBUG: Função send_email_alert_recovery iniciada")
    smtp_server = SMTP_SERVER
    smtp_port = SMTP_PORT
    smtp_user = SMTP_USER
    smtp_password = SMTP_PASSWORD
    to_email = email_data.get('to_email')
    subject = email_data.get('subject')
    body = email_data.get('body')

    if not all([to_email, subject, body, smtp_server, smtp_port, smtp_user, smtp_password]):
        print("DEBUG: send_email_alert_recovery - Configurações de SMTP ou dados do e-mail de recuperação incompletas.")
        return False

    try:
        print("DEBUG: send_email_alert_recovery - Tentando enviar email via SMTP")
        msg = MIMEText(body)
        msg['Subject'] = subject
        msg['From'] = smtp_user
        msg['To'] = to_email

        if smtp_port == 465:
            server = smtplib.SMTP_SSL(smtp_server, smtp_port)
        else:
            server = smtplib.SMTP(smtp_server, smtp_port)
            server.starttls()

        server.login(smtp_user, smtp_password)
        text = msg.as_string()
        server.sendmail(smtp_user, to_email, text)
        server.quit()

        print(f"DEBUG: send_email_alert_recovery - E-mail de recuperação enviado para {to_email}")
        return True

    except Exception as e:
        print(f"DEBUG: send_email_alert_recovery - Erro ao enviar e-mail de recuperação: {e}")
        return False

@app.route('/test_smtp_connection', methods=['POST', 'OPTIONS'])
@cross_origin(origin="http://100.82.178.78:8597", methods=['POST', 'OPTIONS'], supports_credentials=True)
def test_smtp_connection():
    print("DEBUG: Endpoint /test_smtp_connection recebido") # Added debug log
    if not request.json:
        print("DEBUG: /test_smtp_connection - Missing JSON body") # Added debug log
        return jsonify({"error": "Missing JSON body"}), 400

    config_data = request.json
    smtp_server = config_data.get('smtp_server')
    smtp_port = config_data.get('smtp_port')
    smtp_user = config_data.get('smtp_user')
    smtp_password = config_data.get('smtp_password')
    to_email = config_data.get('to_email') # Usar o email de destino fornecido no teste

    if not all([smtp_server, smtp_port, smtp_user, smtp_password, to_email]):
        print("DEBUG: /test_smtp_connection - Missing SMTP configuration or destination email") # Added debug log
        return jsonify({"error": "Missing SMTP configuration or destination email"}), 400

    try:
        print("DEBUG: /test_smtp_connection - Tentando enviar email de teste via SMTP") # Added debug log
        msg = MIMEText("Este é um e-mail de teste do sistema Vigia.")
        msg['Subject'] = "Teste de Conexão SMTP Vigia"
        msg['From'] = smtp_user
        msg['To'] = to_email

        if smtp_port == 465:
            server = smtplib.SMTP_SSL(smtp_server, smtp_port)
        else:
            server = smtplib.SMTP(smtp_server, smtp_port)
            server.starttls()

        server.login(smtp_user, smtp_password)
        text = msg.as_string()
        server.sendmail(smtp_user, to_email, text)
        server.quit()

        print(f"DEBUG: /test_smtp_connection - Teste de conexão SMTP bem-sucedido para {to_email}") # Modified debug log
        return jsonify({"status": "SMTP connection successful", "message": "Test email sent successfully!"})

    except Exception as e:
        print(f"DEBUG: /test_smtp_connection - Erro no teste de conexão SMTP: {e}") # Modified debug log
        return jsonify({"status": "SMTP connection failed", "error": str(e)}), 500

@app.route('/get_smtp_config', methods=['GET'])
@jwt_required()
def get_smtp_config():
    print("DEBUG: Acessando endpoint /get_smtp_config") # Added debug log
    config = load_config()
    smtp_config = {
        'smtp_server': config.get('smtp_server', ''),
        'smtp_port': config.get('smtp_port', 465),
        'smtp_user': config.get('smtp_user', ''),
        'smtp_password': config.get('smtp_password', '')
    }
    return jsonify(smtp_config)

@app.route('/update_smtp_config', methods=['POST', 'OPTIONS'])
@jwt_required()
def update_smtp_config():
    global app_config, config_lock
    if request.method == 'OPTIONS':
        # Responder a requisições OPTIONS com 200 OK e os headers CORS apropriados
        return jsonify({'status': 'options'}), 200

    if not request.json:
        return jsonify({"error": "Missing JSON body"}), 400

    config_data = request.json
    smtp_server = config_data.get('smtp_server')
    smtp_port = config_data.get('smtp_port')
    smtp_user = config_data.get('smtp_user')
    smtp_password = config_data.get('smtp_password')

    if not all([smtp_server, smtp_port, smtp_user, smtp_password]):
        return jsonify({"error": "Missing SMTP configuration fields"}), 400

    with config_lock:
        app_config['smtp_server'] = smtp_server
        app_config['smtp_port'] = smtp_port
        app_config['smtp_user'] = smtp_user
        app_config['smtp_password'] = smtp_password
        save_config(app_config)

    print("Configurações de SMTP atualizadas.")
    return jsonify({"status": "SMTP configuration updated"})

@app.route('/verify_password_reset_code', methods=['POST', 'OPTIONS'])
def verify_password_reset_code():
    # global password_reset_codes # Não precisamos mais deste dicionário
    if request.method == 'OPTIONS':
        # Responder a requisições OPTIONS com 200 OK e os headers CORS apropriados
        return jsonify({'status': 'options'}), 200

    if not request.json or 'username' not in request.json or 'code' not in request.json:
        return jsonify({"error": "Missing username or code"}), 400
    
    username = request.json['username']
    code = request.json['code'] # O frontend envia o código de 6 dígitos

    # Verificar se o código de recuperação é válido no banco de dados
    token_info = query_db('SELECT * FROM password_reset_tokens WHERE username = ? AND token = ? AND used = 0 AND timestamp > ?', 
                          (username, code, int(time.time()) - 60), one=True) # Compara com o código de 6 dígitos

    if token_info:
        return jsonify({"status": "Código de recuperação válido"})
    
    return jsonify({"error": "Código de recuperação inválido ou expirado"}), 400

@app.route('/reset_password', methods=['POST'])
def reset_password():
    print("DEBUG: Endpoint /reset_password recebido")
    # global password_reset_codes, users # Não precisamos mais do dicionário de códigos e usuários

    if not request.json or 'username' not in request.json or 'code' not in request.json or 'new_password' not in request.json:
        print("DEBUG: /reset_password - Missing username, code, or new password")
        return jsonify({"error": "Missing username, code, or new password"}), 400

    username = request.json['username']
    code = request.json['code'] # O frontend envia o código de 6 dígitos
    new_password = request.json['new_password']

    print(f"DEBUG: /reset_password - Recebido username: {username}, code: {code}, new_password: {new_password}") # DEBUG

    # Verificar se o token de recuperação é válido e não expirou no banco de dados
    # A consulta verifica: username, token (código), se não foi usado (used=0) e se não expirou (timestamp > agora - 600s)
    current_time = int(time.time())
    expiration_threshold = current_time - 60
    print(f"DEBUG: /reset_password - Tempo atual: {current_time}, Limite de expiração: {expiration_threshold}") # DEBUG

    token_info = query_db('SELECT * FROM password_reset_tokens WHERE username = ? AND token = ? AND used = 0 AND timestamp > ?', 
                          (username, code, expiration_threshold), one=True)

    print(f"DEBUG: /reset_password - Resultado da consulta ao banco de dados: {token_info}") # DEBUG

    if token_info:
        # Token válido, agora atualiza a senha no banco de dados de usuários
        db = get_db()
        
        # Gerar hash da nova senha antes de armazenar
        hashed_new_password = bcrypt.generate_password_hash(new_password).decode('utf-8')
        
        query_db('UPDATE users SET password = ? WHERE username = ?', (hashed_new_password, username))
        
        # Marcar o token como usado no banco de dados
        query_db('UPDATE password_reset_tokens SET used = 1 WHERE token = ?', (code,))
        db.commit()

        print(f"DEBUG: Senha redefinida com sucesso para o usuário {username} (no banco de dados).") # DEBUG
        return jsonify({"status": "Password reset successful"})
    
    print(f"DEBUG: /reset_password - Token inválido ou expirado para o usuário {username}") # DEBUG
    return jsonify({"error": "Invalid or expired token"}), 400

@app.route('/change_password', methods=['POST', 'OPTIONS'])
@cross_origin(origin="http://100.82.178.78:8597", methods=['POST', 'OPTIONS'], supports_credentials=True)
@jwt_required()
def change_password():
    print("DEBUG: Endpoint /change_password recebido")
    if not request.json or 'current_password' not in request.json or 'new_password' not in request.json:
        print("DEBUG: /change_password - Missing JSON body or fields")
        return jsonify({"error": "Missing current_password or new_password"}), 400

    current_password = request.json.get('current_password')
    new_password = request.json.get('new_password')
    current_user = get_jwt_identity() # Obtém a identidade do usuário do token JWT

    # Recupera o usuário pelo nome de usuário para obter o hash da senha
    user = query_db('SELECT * FROM users WHERE username = ?', (current_user,), one=True)

    # Verifica se o usuário existe e se a senha atual fornecida está correta
    if user and bcrypt.check_password_hash(user['password'], current_password):
        # Gera o hash da nova senha
        hashed_new_password = bcrypt.generate_password_hash(new_password).decode('utf-8')
        
        # Atualiza a senha no banco de dados com o novo hash
        db = get_db()
        query_db('UPDATE users SET password = ? WHERE username = ?', (hashed_new_password, current_user))
        db.commit()
        
        print(f"DEBUG: Senha para o usuário {current_user} alterada com sucesso (no banco de dados).")
        return jsonify({"status": "Password changed successfully"})
    else:
        # Se o usuário não for encontrado ou a senha atual não corresponder
        print(f"DEBUG: Tentativa de mudança de senha falhou para o usuário {current_user}. Senha atual incorreta.")
        return jsonify({"error": "Invalid current password"}), 401

@app.route('/test', methods=['GET'])
def test():
    return jsonify({"status": "Servidor está funcionando"}), 200

if __name__ == '__main__':
    # A inicialização do banco de dados agora é feita no contexto da aplicação acima

    # Inicia a thread da câmera se não estiver rodando
    if camera_thread is None or not camera_thread.is_alive():
        camera_thread = CameraThread()
        camera_thread.start()
        print("Thread da câmera iniciada no backend.")

    app.run(host='0.0.0.0', port=5000, threaded=True)
