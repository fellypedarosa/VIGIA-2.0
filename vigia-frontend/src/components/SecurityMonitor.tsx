import React, { useCallback, useEffect, useState, useRef } from 'react';
// import { useWebcam } from '@/hooks/useWebcam'; // Remover ou adaptar
// import { useMotionDetection } from '@/hooks/useMotionDetection'; // Remover ou adaptar
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input'; // Importar Input
import { Label } from '@/components/ui/label'; // Importar Label
import { EmailConfig } from '@/components/EmailConfig';
import { useEmailAlert } from '@/hooks/useEmailAlert';
import { useToast } from '@/hooks/use-toast';
import { Webcam, Play, Pause, Square, Settings, Camera, Shield, AlertTriangle } from 'lucide-react';

type MonitoringState = 'stopped' | 'starting' | 'monitoring' | 'paused' | 'alert' | 'error';

const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'; // Conectar ao backend usando o IP do servidor

// Helper function to find index of a sequence of bytes in Uint8Array
// Handles cases where the sequence might be split across the end of the buffer
function findBytesIndex(buffer: Uint8Array, searchBytes: Uint8Array, start: number = 0): number {
    for (let i = start; i <= buffer.length - searchBytes.length; i++) {
        let found = true;
        for (let j = 0; j < searchBytes.length; j++) {
            if (buffer[i + j] !== searchBytes[j]) {
                found = false;
                break;
            }
        }
        if (found) {
            return i;
        }
    }
    return -1;
}

// Helper function to encode Uint8Array to base64
function base64Encode(bytes: Uint8Array): string {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

const SecurityMonitor = () => {
  const [monitoringState, setMonitoringState] = useState<MonitoringState>('stopped');
  const [alertThreshold, setAlertThreshold] = useState(10); // Estado para a tolerância
  const [capturedImages, setCapturedImages] = useState<Array<{ timestamp: number; image: string; score: number }>>([]);
  const [isMinimized, setIsMinimized] = useState(false);
  const [showEmailConfig, setShowEmailConfig] = useState(false);
  const [showCameraFeed, setShowCameraFeed] = useState(false); // Novo estado
  const [backendError, setBackendError] = useState<string | null>(null);
  const { toast } = useToast();
  const { sendAlert, isSending } = useEmailAlert();

  // --- Estados para Autenticação ---
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('jwt_token')); // Tenta carregar o token do localStorage

  // Referência para a imagem do feed de vídeo
  const videoFeedRef = useRef<HTMLImageElement>(null);

  // --- Função auxiliar para requisições autenticadas ---
  const authenticatedFetch = useCallback(async (url: string, options: RequestInit = {}) => {
    const headers = {
      ...options.headers,
      'Authorization': `Bearer ${token}`,
    };
    const response = await fetch(url, { ...options, headers });
    if (response.status === 401) {
      // Token expirado ou inválido, limpar token e forçar login
      setToken(null);
      localStorage.removeItem('jwt_token');
      setLoginError('Sessão expirada. Por favor, faça login novamente.');
      // Opcional: redirecionar para página de login se houver uma
    }
    return response;
  }, [token]); // Depende do token

  // Remover ou adaptar hooks locais
  // const {
  //   videoRef,
  //   isActive: cameraActive,
  //   error: cameraError,
  //   startCamera,
  //   stopCamera,
  //   captureFrame
  // } = useWebcam();

  // const handleMotionDetected = useCallback(async (score: number, frame: string) => {
  //   // ... lógica de detecção de movimento local ...
  // }, [toast, monitoringState, sendAlert, emailConfigured]);

  // const {
  //   isDetecting,
  //   sensitivityLevel,
  //   lastMotionTime,
  //   motionScore,
  //   startDetection,
  //   stopDetection,
  //   setSensitivity
  // } = useMotionDetection({
  //   sensitivity: 50,
  //   minMotionArea: 150,
  //   onMotionDetected: handleMotionDetected
  // });

  // Efeito para iniciar/parar o stream de vídeo e processar frames
  useEffect(() => {
    let isMounted = true; // Flag para verificar se o componente ainda está montado
    let reader: ReadableStreamDefaultReader | null = null;
    let response: Response | null = null;

    const fetchVideoFeed = async () => {
      // Adicionada verificação showCameraFeed
      if (!token || !showCameraFeed || (monitoringState !== 'monitoring' && monitoringState !== 'paused')) {
        console.log('Não buscando feed de vídeo: sem token, feed minimizado ou monitoramento não ativo.');
        if (videoFeedRef.current) {
          videoFeedRef.current.src = ''; // Limpar a fonte
        }
        return;
      }

      console.log('Iniciando fetch para /video_feed com token.');
      try {
        // Usar authenticatedFetch que já lida com 401
        response = await authenticatedFetch(`${BACKEND_URL}/video_feed`);

        if (!response.ok) {
          console.error('Erro na resposta do feed de vídeo:', response.status, response.statusText);
          if (isMounted) {
             // authenticatedFetch já deve ter lidado com 401, outros erros podem ser tratados aqui
             if (response.status !== 401) {
                setBackendError(`Erro ao obter feed de vídeo: ${response.statusText}`);
                setMonitoringState('error');
             }
          }
          return;
        }

        if (!response.body) {
          console.error('Resposta do feed de vídeo sem corpo.');
           if (isMounted) {
              setBackendError('Resposta do feed de vídeo sem corpo.');
              setMonitoringState('error');
           }
          return;
        }

        // Extrair o boundary do cabeçalho Content-Type
        const contentType = response.headers.get('Content-Type');
        if (!contentType || !contentType.includes('multipart/x-mixed-replace')) {
             console.error('Tipo de conteúdo inesperado para feed de vídeo:', contentType);
              if (isMounted) {
                setBackendError('Tipo de conteúdo inesperado do feed de vídeo.');
                setMonitoringState('error');
              }
             return;
        }
        const boundaryMatch = contentType.match(/boundary=(.+)/);
        if (!boundaryMatch || !boundaryMatch[1]) {
             console.error('Boundary não encontrado no cabeçalho Content-Type.');
              if (isMounted) {
                setBackendError('Boundary do feed de vídeo não encontrado.');
                setMonitoringState('error');
              }
             return;
        }
        const boundary = '--' + boundaryMatch[1];
        const boundaryBytes = new TextEncoder().encode('\r\n' + boundary);
        const delimiterBytes = new TextEncoder().encode('\r\n\r\n');

        reader = response.body.getReader();
        let buffer = new Uint8Array(0);

        while (isMounted) { // Continuar lendo enquanto o componente estiver montado
          const { done, value } = await reader.read();

          if (done) {
            console.log('Stream do feed de vídeo finalizado.');
            break;
          }

          if (value) {
            // Adicionar o novo chunk ao buffer
            const newBuffer = new Uint8Array(buffer.length + value.length);
            newBuffer.set(buffer);
            newBuffer.set(value, buffer.length);
            buffer = newBuffer;

            let boundaryIndex = -1;
            let frameStartIndex = 0;

            // Processar o buffer para encontrar frames
            while ((boundaryIndex = findBytesIndex(buffer, boundaryBytes, frameStartIndex)) !== -1) {
                const headerEndIndex = findBytesIndex(buffer, delimiterBytes, boundaryIndex + boundaryBytes.length);

                if (headerEndIndex !== -1) {
                    const frameDataStartIndex = headerEndIndex + delimiterBytes.length;
                    // Encontrar o próximo boundary para saber onde o frame termina
                    const nextBoundaryIndex = findBytesIndex(buffer, boundaryBytes, frameDataStartIndex);

                    if (nextBoundaryIndex !== -1) {
                        const frameDataEndIndex = nextBoundaryIndex;
                        const frameData = buffer.slice(frameDataStartIndex, frameDataEndIndex);

                        if (videoFeedRef.current && isMounted) {
                            // Atualizar a imagem com o novo frame
                            const base64Data = base64Encode(frameData);
                            videoFeedRef.current.src = `data:image/jpeg;base64,${base64Data}`;
                        }

                        // Remover o frame processado do buffer
                        buffer = buffer.slice(nextBoundaryIndex);
                        frameStartIndex = 0; // Resetar o start index para a nova buffer
                    } else {
                        // O próximo boundary não está no buffer atual, esperar mais chunks
                        frameStartIndex = boundaryIndex + boundaryBytes.length; // Continuar procurando a partir daqui
                        break; // Sair do loop while interno, esperar mais dados
                    }
                } else {
                     // O fim do cabeçalho não está no buffer atual, esperar mais chunks
                     frameStartIndex = boundaryIndex + boundaryBytes.length; // Continuar procurando a partir daqui
                     break; // Sair do loop while interno, esperar mais dados
                }
            }
          }
        }

      } catch (error: any) {
        if (isMounted) {
            console.error('Erro durante o fetch ou processamento do feed de vídeo:', error);
             // authenticatedFetch já deve ter lidado com 401
             if (error.message !== 'Sessão expirada. Por favor, faça login novamente.') { // Evitar duplicar erro de 401
                 setBackendError(error.message || 'Erro ao obter feed de vídeo.');
                 setMonitoringState('error');
             }
        }
      } finally {
          if (reader) {
              try {
                  await reader.cancel(); // Cancelar o reader no final ou em caso de erro
                  console.log('Reader do feed de vídeo cancelado.');
              } catch (cancelError) {
                  console.error('Erro ao cancelar reader:', cancelError);
              }
          }
           if (response && response.body && response.body.cancel) {
               try {
                   await response.body.cancel(); // Cancelar o corpo da resposta
                    console.log('Corpo da resposta do feed de vídeo cancelado.');
               } catch (cancelError) {
                   console.error('Erro ao cancelar corpo da resposta:', cancelError);
               }
           }
          if (videoFeedRef.current) {
             videoFeedRef.current.src = ''; // Limpar a fonte ao parar
          }
          console.log('Limpeza do feed de vídeo concluída.');
      }
    };

    fetchVideoFeed();

    // Função de limpeza
    return () => {
      isMounted = false; // Marcar componente como desmontado
      if (reader) {
        try {
           reader.cancel(); // Tentar cancelar o reader
           console.log('Cleanup: Reader do feed de vídeo cancelado.');
        } catch (cancelError) {
           console.error('Cleanup: Erro ao cancelar reader:', cancelError);
        }
      }
       if (response && response.body && response.body.cancel) {
           try {
               response.body.cancel(); // Tentar cancelar o corpo da resposta
                console.log('Cleanup: Corpo da resposta do feed de vídeo cancelado.');
           } catch (cancelError) {
               console.error('Cleanup: Erro ao cancelar corpo da resposta:', cancelError);
           }
       }
      if (videoFeedRef.current) {
        videoFeedRef.current.src = ''; // Limpar a fonte na limpeza
      }
      console.log('Cleanup: Limpeza do feed de vídeo concluída.');
    };

  }, [monitoringState, token, authenticatedFetch]); // Dependências: monitoringState, token, authenticatedFetch

  // Efeito para buscar alertas (polling)
  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    if (monitoringState === 'monitoring' && token) { // Verificar se há token antes de iniciar o polling
      console.log('Iniciando polling para /check_alerts');
      intervalId = setInterval(async () => {
        try {
          // Usar authenticatedFetch
          const response = await authenticatedFetch(`${BACKEND_URL}/check_alerts`);
          if (!response.ok) {
            throw new Error('Falha na resposta da rede');
          }
          const data = await response.json();

          if (data.alerts && data.alerts.length > 0) {
            console.log(`${data.alerts.length} novo(s) alerta(s) recebido(s)`);
            setCapturedImages(prevImages => [...data.alerts, ...prevImages].slice(0, 10)); // Adiciona novos alertas no início

            // Mostra uma notificação para o alerta mais recente
            const latestAlert = data.alerts[0];
            toast({
              title: "Alerta de Movimento!",
              description: `Detectado movimento com score de ${latestAlert.score}%.`,
              variant: "destructive"
            });
          }
        } catch (error) {
          console.error('Erro durante o polling de alertas:', error);
           // Se o erro for 401, authenticatedFetch já cuidará de limpar o token
        }
      }, 2000); // Verifica a cada 2 segundos
    }

    // Função de limpeza para parar o polling
    return () => {
      if (intervalId) {
        console.log('Parando polling para /check_alerts');
        clearInterval(intervalId);
      }
    };
  }, [monitoringState, toast, token, authenticatedFetch]); // Adicionar token e authenticatedFetch como dependências

  const handleStart = useCallback(async (event?: React.MouseEvent<HTMLButtonElement>) => {
    console.log('handleStart chamado');
    setMonitoringState('starting');
    setBackendError(null);
    try {
      console.log(`Tentando conectar ao backend em: ${BACKEND_URL}/start_monitoring`);
      // Usar authenticatedFetch
      const response = await authenticatedFetch(`${BACKEND_URL}/start_monitoring`);
      const data = await response.json();
      if (response.ok) {
        // A atualização do src agora é feita no useEffect
        setMonitoringState('monitoring');
        toast({
          title: "Monitoramento Iniciado",
          description: data.status,
        });
      } else {
        console.error('Erro ao iniciar monitoramento - Resposta do backend:', data);
         setMonitoringState('error');
        setBackendError(data.status || 'Erro ao iniciar monitoramento');
        toast({
          title: "Erro ao iniciar monitoramento",
          description: data.status || 'Verifique o backend.',
          variant: "destructive"
        });
      }
    } catch (error: any) {
      console.error('Erro no handleStart:', error);
       setMonitoringState('error');
      setBackendError(error.message || 'Erro de comunicação com o backend.');
      toast({
        title: "Erro de comunicação",
        description: "Não foi possível conectar ao backend.",
        variant: "destructive"
      });
      console.error('Erro ao iniciar monitoramento:', error);
    }
  }, [toast, authenticatedFetch]); // Adicionar authenticatedFetch como dependência

  const handlePause = useCallback(async () => {
    console.log('handlePause chamado');
    setBackendError(null);
    try {
      // Usar authenticatedFetch
      const response = await authenticatedFetch(`${BACKEND_URL}/pause_monitoring`);
      const data = await response.json();
      if (response.ok) {
        setMonitoringState('paused');
        toast({
          title: "Monitoramento Pausado",
          description: data.status,
        });
      } else {
        console.error('Erro ao pausar monitoramento - Resposta do backend:', data);
        setBackendError(data.status || 'Erro ao pausar monitoramento');
        toast({
          title: "Erro ao pausar monitoramento",
          description: data.status || 'Verifique o backend.',
          variant: "destructive"
        });
      }
    } catch (error: any) {
      console.error('Erro no handlePause:', error);
      setBackendError(error.message || 'Erro de comunicação com o backend.');
      toast({
        title: "Erro de comunicação",
        description: "Não foi possível conectar ao backend.",
        variant: "destructive"
      });
      console.error('Erro ao pausar monitoramento:', error);
    }
  }, [toast, authenticatedFetch]); // Adicionar authenticatedFetch como dependência

  const handleResume = useCallback(async () => {
    console.log('handleResume chamado');
    setBackendError(null);
    try {
      // Usar authenticatedFetch
      const response = await authenticatedFetch(`${BACKEND_URL}/resume_monitoring`);
      const data = await response.json();
      if (response.ok) {
        setMonitoringState('monitoring');
        toast({
          title: "Monitoramento Retomado",
          description: data.status,
        });
      } else {
        console.error('Erro ao retomar monitoramento - Resposta do backend:', data);
        setBackendError(data.status || 'Erro ao retomar monitoramento');
        toast({
          title: "Erro ao retomar monitoramento",
          description: data.status || 'Verifique o backend.',
          variant: "destructive"
        });
      }
    } catch (error: any) {
      console.error('Erro no handleResume:', error);
      setBackendError(error.message || 'Erro de comunicação com o backend.');
      toast({
        title: "Erro de comunicação",
        description: "Não foi possível conectar ao backend.",
        variant: "destructive"
      });
      console.error('Erro ao retomar monitoramento:', error);
    }
  }, [toast, authenticatedFetch]); // Adicionar authenticatedFetch como dependência

  const handleStop = useCallback(async () => {
     console.log('handleStop chamado');
    setMonitoringState('stopped');
    setBackendError(null);
    try {
      console.log(`Tentando conectar ao backend em: ${BACKEND_URL}/stop_monitoring`);
      // Usar authenticatedFetch
      const response = await authenticatedFetch(`${BACKEND_URL}/stop_monitoring`);
      const data = await response.json();
      if (response.ok) {
        toast({
          title: "Monitoramento Parado",
          description: data.status,
        });
      } else {
         console.error('Erro ao parar monitoramento - Resposta do backend:', data);
        setMonitoringState('error');
        setBackendError(data.status || 'Erro ao parar monitoramento');
         toast({
          title: "Erro ao parar monitoramento",
          description: data.status || 'Verifique o backend.',
          variant: "destructive"
        });
      }
    } catch (error: any) {
       console.error('Erro no handleStop:', error);
        setMonitoringState('error');
       setBackendError(error.message || 'Erro de comunicação com o backend.');
       toast({
        title: "Erro de comunicação",
        description: "Não foi possível conectar ao backend.",
        variant: "destructive"
      });
      console.error('Erro ao parar monitoramento:', error);
    }
  }, [toast, authenticatedFetch]); // Adicionar authenticatedFetch como dependência

  // Pausar e Retomar podem ser removidos ou adaptados se o backend não tiver essa funcionalidade separada
  // Por enquanto, vamos focar em Iniciar e Parar.
  const handlePauseFrontend = useCallback(() => {
    // Lógica de pausa no frontend, se aplicável, ou remover
    setMonitoringState('paused');
     if (videoFeedRef.current) {
            videoFeedRef.current.src = ''; // Pausar o stream visualmente
        }
     toast({
          title: "Monitoramento Pausado",
          description: "O feed de vídeo foi pausado localmente.",
        });
  }, [toast]);

  const handleResumeFrontend = useCallback(() => {
    // Lógica de retomar no frontend, se aplicável, ou remover
     setMonitoringState('monitoring');
      if (videoFeedRef.current) {
            videoFeedRef.current.src = `${BACKEND_URL}/video_feed`; // Retomar o stream visualmente
        }
      toast({
          title: "Monitoramento Retomado",
          description: "O feed de vídeo foi retomado localmente.",
        });
  }, [toast]);


  const getStatusInfo = () => {
    switch (monitoringState) {
      case 'starting':
        return { 
          text: 'Iniciando...', 
          color: 'bg-monitoring-warning',
          icon: Settings 
        };
      case 'monitoring':
        return { 
          text: 'Monitorando', 
          color: 'bg-monitoring-active shadow-success',
          icon: Shield 
        };
      case 'paused':
        return { 
          text: 'Pausado', 
          color: 'bg-monitoring-inactive',
          icon: Pause 
        };
      case 'alert':
        return { 
          text: 'Movimento Detectado!', 
          color: 'bg-monitoring-alert shadow-alert animate-pulse-security',
          icon: AlertTriangle 
        };
      case 'error':
         return { 
          text: 'Erro', 
          color: 'bg-destructive',
          icon: AlertTriangle 
        };
      default:
        return { 
          text: 'Parado', 
          color: 'bg-muted',
          icon: Square 
        };
    }
  };

  const statusInfo = getStatusInfo();
  const StatusIcon = statusInfo.icon;

  // Remover ou adaptar a lógica de minimização se necessário
  if (isMinimized) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <Card className="w-64 bg-card/95 backdrop-blur border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <StatusIcon className="h-4 w-4" />
                <Badge className={statusInfo.color}>
                  {statusInfo.text}
                </Badge>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsMinimized(false)}
              >
                Expandir
              </Button>
            </div>
            {/* Remover ou adaptar exibição de sensibilidade/score local */}
            {/* {monitoringState === 'monitoring' && (
              <div className="mt-2 text-xs text-muted-foreground">
                Sensibilidade: {sensitivityLevel}% | Score: {Math.round(motionScore)}
              </div>
            )} */}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Handler para atualizar a tolerância no backend - MOVIDO PARA DENTRO DO COMPONENTE
  const handleThresholdChange = useCallback(async (value: number) => {
    console.log(`handleThresholdChange chamado. Enviando novo threshold para o backend: ${value}`); // Log para depuração
    try {
      // Usar authenticatedFetch
      await authenticatedFetch(`${BACKEND_URL}/set_threshold`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ threshold: value }),
      });
    } catch (error) {
      console.error('Erro ao atualizar a tolerância:', error);
      toast({
        title: "Erro de comunicação",
        description: "Não foi possível atualizar a tolerância no backend.",
        variant: "destructive"
      });
    }
  }, [toast, authenticatedFetch]); // Dependências: toast, authenticatedFetch

  // --- Função de Login ---
  const handleLogin = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    setLoginError(null);
    try {
      const response = await fetch(`${BACKEND_URL}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (response.ok) {
        setToken(data.access_token);
        localStorage.setItem('jwt_token', data.access_token);
        setUsername(''); // Limpa os campos após o login
        setPassword('');
        toast({
          title: "Login bem-sucedido",
          description: "Autenticado com sucesso.",
        });
      } else {
        setLoginError(data.msg || 'Erro no login');
        toast({
          title: "Erro no Login",
          description: data.msg || 'Credenciais inválidas.',
          variant: "destructive"
        });
      }
    } catch (error: any) {
      setLoginError('Erro de comunicação com o backend.');
      toast({
        title: "Erro de comunicação",
        description: "Não foi possível conectar ao backend para login.",
        variant: "destructive"
      });
      console.error('Erro no handleLogin:', error);
    }
  }, [username, password, toast]); // Dependências: username, password, toast

  // Renderizar formulário de login se não houver token
  if (!token) {
    return (
      <div className="min-h-screen bg-background p-4 flex items-center justify-center">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="text-2xl">Login</CardTitle>
            <p className="text-muted-foreground">Insira suas credenciais para acessar o sistema.</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="username">Nome de Usuário</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="usuario"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              {loginError && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{loginError}</AlertDescription>
                </Alert>
              )}
              <Button type="submit" className="w-full">
                Entrar
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ... Restante do código do componente (UI de monitoramento) ...
  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Shield className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Vigia</h1>
              <p className="text-muted-foreground">Sistema de detecção de movimento</p>
            </div>
          </div>
           {/* Botão de Logout (Opcional, adicionar se necessário) */}
           <Button variant="ghost" onClick={() => {
             setToken(null);
             localStorage.removeItem('jwt_token');
             setMonitoringState('stopped'); // Parar monitoramento ao deslogar
             setBackendError(null);
             toast({
               title: "Logout bem-sucedido",
               description: "Desconectado do sistema.",
             });
           }}>Logout</Button>
        </div>

        {/* Status Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <StatusIcon className="h-5 w-5" />
              Status do Sistema
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between mb-4">
              <Badge className={`${statusInfo.color} text-white px-4 py-2`}>
                {statusInfo.text}
              </Badge>
            </div>
            {/* Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(monitoringState === 'stopped' || monitoringState === 'error') && (
                <Button
                  onClick={handleStart}
                  variant="security"
                >
                  <Play className="h-4 w-4 mr-2" />
                  Iniciar Monitoramento
                </Button>
              )}
              {monitoringState === 'monitoring' && (
                <Button
                  onClick={handlePause}
                  variant="secondary"
                >
                  <Pause className="h-4 w-4 mr-2" />
                  Pausar Monitoramento
                </Button>
              )}
              {monitoringState === 'paused' && (
                <Button
                  onClick={handleResume}
                  variant="monitoring"
                >
                  <Play className="h-4 w-4 mr-2" />
                  Retomar Monitoramento
                </Button>
              )}
              {(monitoringState === 'monitoring' || monitoringState === 'paused' || monitoringState === 'alert') && (
                <Button
                  onClick={handleStop}
                  variant="destructive"
                >
                  <Square className="h-4 w-4 mr-2" />
                  Parar Monitoramento
                </Button>
              )}
            </div>
             {backendError && (
                <Alert variant="destructive" className="mt-4">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{backendError}</AlertDescription>
                </Alert>
              )}

            {/* Controle de Sensibilidade */}
            <div className="mt-4">
              <Label htmlFor="sensitivity" className="mb-2 block">
                Sensibilidade de Detecção (Tolerância a Alertas)
              </Label>
              <div className="flex items-center gap-4">
                <Slider
                  id="sensitivity"
                  min={1}
                  max={100}
                  step={1}
                  value={[alertThreshold]}
                  onValueChange={(value) => setAlertThreshold(value[0])}
                  onValueCommit={(value) => handleThresholdChange(value[0])}
                  className="flex-1"
                  disabled={monitoringState === 'stopped' || monitoringState === 'error'}
                />
                <span className="font-mono text-sm w-12 text-center">{alertThreshold}%</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Valores mais baixos são mais sensíveis a movimentos.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Email Configuration - minimizável */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between cursor-pointer select-none" onClick={() => setShowEmailConfig((v) => !v)}>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Configuração de E-mail
            </CardTitle>
            <Button variant="ghost" size="sm">
              {showEmailConfig ? 'Ocultar' : 'Mostrar'}
            </Button>
          </CardHeader>
          {showEmailConfig && (
            <CardContent>
              <EmailConfig />
            </CardContent>
          )}
        </Card>

        {/* Card do Feed da Câmera e Capturas */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Camera className="h-5 w-5" />
              <CardTitle>Feed da Câmera</CardTitle>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setShowCameraFeed(!showCameraFeed)}>
              {showCameraFeed ? 'Ocultar' : 'Mostrar'}
            </Button>
          </CardHeader>
          {showCameraFeed && (
            <CardContent>
              {monitoringState === 'error' && backendError && (
                <Alert variant="destructive" className="mb-4">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    {backendError === 'Failed to fetch' ? 'Erro de conexão com o backend. Verifique se ele está em execução.' : backendError}
                  </AlertDescription>
                </Alert>
              )}
              <div className="relative mb-4 bg-black rounded-md overflow-hidden">
                <img
                  ref={videoFeedRef}
                  alt="Feed da Câmera"
                  className="w-full h-auto"
                  // Exibir placeholder se a imagem estiver vazia
                  src={videoFeedRef.current?.src || '/placeholder.svg'}
                  onError={(e) => {
                    // Em caso de erro ao carregar a imagem (ex: 'Load failed'), mostrar o placeholder
                    (e.target as HTMLImageElement).src = '/placeholder.svg';
                  }}
                />
                <div className="absolute top-2 right-2">
                  <Badge variant={monitoringState === 'monitoring' ? 'default' : 'destructive'}>
                    {monitoringState === 'monitoring' ? 'Ao Vivo' : 'Parado'}
                  </Badge>
                </div>
              </div>

              <h3 className="text-lg font-semibold mb-2">Capturas Recentes</h3>
              {capturedImages.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {capturedImages.map((capture) => (
                    <div key={capture.timestamp} className="relative group">
                      <img
                        src={capture.image.startsWith('data:image') ? capture.image : `data:image/jpeg;base64,${capture.image}`}
                        alt={`Captura em ${new Date(capture.timestamp).toLocaleTimeString()}`}
                        className="w-full h-auto rounded-md"
                      />
                      <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-xs text-center p-1">
                        {new Date(capture.timestamp).toLocaleTimeString()} (Score: {capture.score})
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhuma imagem capturada recentemente.</p>
              )}
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
};

export default SecurityMonitor;