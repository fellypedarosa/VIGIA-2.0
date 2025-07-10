import React, { useState, FormEvent, useCallback, useEffect } from 'react';
import SecurityMonitor from '@/components/SecurityMonitor';
import { useToast } from '@/components/ui/use-toast';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

// Componente reutilizável para formulários de senha
const PasswordForm = ({
  onSubmit,
  submitText,
  onCancel,
  title,
  // Adicionar prop para a senha atual
  currentPassword,
  onCurrentPasswordChange,
}: {
  onSubmit: (newPass: string, currentPass?: string) => void; // Modificar onSubmit para aceitar senha atual
  submitText: string;
  onCancel?: () => void;
  title: string;
  // Adicionar props para a senha atual
  currentPassword?: string;
  onCurrentPasswordChange?: (value: string) => void;
}) => {
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!newPass || newPass.length < 4) {
      setError('A senha deve ter pelo menos 4 caracteres.');
      return;
    }
    if (newPass !== confirmPass) {
      setError('As senhas não coincidem.');
      return;
    }
     // Verificar se a senha atual foi fornecida quando necessário
    if (currentPassword !== undefined && !currentPassword) {
         setError('Por favor, insira sua senha atual.');
         return;
    }
    setError('');
    console.log('PasswordForm handleSubmit: Chamando onSubmit com newPass=', newPass, 'currentPass=', currentPassword); // DEBUG
    // Passar a senha atual para onSubmit se ela existir
    onSubmit(newPass, currentPassword);
  };

  return (
    // Removido o estilo de container que fazia parecer um quadrado preto
    <div className="space-y-4"> {/* Mantém apenas o espaçamento interno */}
      {title && <h1 className="text-2xl font-bold text-center mb-6">{title}</h1>} {/* Exibe o título apenas se fornecido */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Adicionar campo para senha atual se a prop existir */}
        {currentPassword !== undefined && onCurrentPasswordChange && (
             <div>
                <Label htmlFor="current-password">Senha Atual</Label>
                <Input
                  id="current-password"
                  type="password"
                  value={currentPassword}
                  onChange={e => onCurrentPasswordChange(e.target.value)}
                  required
                />
             </div>
        )}
        <div>
          <Label htmlFor="new-password">Nova senha</Label>
          <Input
            id="new-password"
            type="password"
            value={newPass}
            onChange={e => setNewPass(e.target.value)}
            required
            autoFocus
          />
        </div>
        <div>
          <Label htmlFor="confirm-password">Confirmar nova senha</Label>
          <Input
            id="confirm-password"
            type="password"
            value={confirmPass}
            onChange={e => setConfirmPass(e.target.value)}
            required
          />
        </div>
        {error && <div className="text-red-500 text-sm text-center">{error}</div>}
        <Button type="submit" className="w-full">{submitText}</Button>
        {onCancel && (
          <Button type="button" onClick={onCancel} variant="secondary" className="w-full mt-2">Cancelar</Button>
        )}
      </form>
    </div>
  );
};

const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'; // Conectar ao backend usando o IP do servidor

const Index = () => {
  const { toast } = useToast();
  // Inicializa isAuthenticated verificando a presença do token no localStorage
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('jwt_token'));
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [recoveryStep, setRecoveryStep] = useState<'none' | 'waiting' | 'verify' | 'reset'>('none');
  const [codeInput, setCodeInput] = useState('');
  const [recoveryError, setRecoveryError] = useState('');
  const [showCredentialsManagement, setShowCredentialsManagement] = useState(false); // Novo estado
  const [currentRecoveryEmail, setCurrentRecoveryEmail] = useState<string | null>(null);
  const [newRecoveryEmail, setNewRecoveryEmail] = useState('');
  const [isUpdatingEmail, setIsUpdatingEmail] = useState(false);
  // Adicionar estado para a senha atual no formulário de mudança de senha
  const [currentPasswordChange, setCurrentPasswordChange] = useState('');

  // Efeito para carregar o email de recuperação quando a tela de gerenciamento é aberta
  // Manter este useEffect, ele já usa o token JWT
  useEffect(() => {
    if (showCredentialsManagement) {
      const fetchRecoveryEmail = async () => {
        try {
          const token = localStorage.getItem('jwt_token'); // Obter token do localStorage
          if (!token) {
            console.error('Token JWT não encontrado no localStorage.');
            setCurrentRecoveryEmail('Erro: Não autenticado.');
            // Opcional: redirecionar para tela de login principal
            setIsAuthenticated(false); // Garante que a tela de login apareça
            return;
          }

          const response = await fetch(`${BACKEND_URL}/get_recovery_email`, {
            headers: {
              'Authorization': `Bearer ${token}`, // Incluir token no cabeçalho
            },
          });
          if (response.ok) {
            const data = await response.json();
            setCurrentRecoveryEmail(data.recovery_email);
            setNewRecoveryEmail(data.recovery_email || ''); // Preenche o campo com o email atual
          } else if (response.status === 401) {
             console.error('Erro ao buscar email de recuperação: Não autorizado.');
             setCurrentRecoveryEmail('Erro: Não autorizado.');
             // Limpar token e forçar login
             localStorage.removeItem('jwt_token');
             setIsAuthenticated(false); // Garante que a tela de login apareça
          } else {
            console.error('Erro ao buscar email de recuperação:', response.status);
            setCurrentRecoveryEmail('Erro ao carregar');
          }
        } catch (error) {
          console.error('Erro de comunicação ao buscar email de recuperação:', error);
          setCurrentRecoveryEmail('Erro de comunicação');
        }
      };
      fetchRecoveryEmail();
    }
  }, [showCredentialsManagement]);

  // --- Modificar handleLogin para usar o backend JWT ---
  const handleLogin = useCallback(async (e: FormEvent) => {
    e.preventDefault(); // Previne o recarregamento da página
    setError(''); // Limpa erros anteriores
    setSending(true); // Indica que a requisição está em andamento

    console.log('Attempting login to:', `${BACKEND_URL}/login`); // Log da URL
    console.log('Sending data:', { username: user, password: pass }); // Log dos dados enviados

    try {
      const response = await fetch(`${BACKEND_URL}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: user, password: pass }),
      });

      const data = await response.json();

      console.log('Received response status:', response.status); // Log do status da resposta
      console.log('Received response data:', data); // Log dos dados da resposta

      if (response.ok) {
        // Login bem-sucedido, armazena o token e atualiza o estado
        localStorage.setItem('jwt_token', data.access_token);
        setIsAuthenticated(true);
        setUser(''); // Limpa os campos após o login
        setPass('');
        toast({
          title: "Login bem-sucedido",
          description: "Autenticado com sucesso.",
        });
      } else {
        // Login falhou, exibe mensagem de erro do backend
        setError(data.msg || 'Erro no login');
        toast({
          title: "Erro no Login",
          description: data.msg || 'Credenciais inválidas.',
          variant: "destructive"
        });
      }
    } catch (error: any) {
      // Erro de comunicação
      console.error('Erro no handleLogin:', error);
      setError('Erro de comunicação com o backend.');
      toast({
        title: "Erro de comunicação",
        description: "Não foi possível conectar ao backend para login.",
        variant: "destructive"
      });
    }
    setSending(false); // Finaliza o estado de envio
  }, [user, pass, toast]); // Dependências: user, pass, toast

  // --- Modificar handleSaveNewPassword para usar o backend /change_password ---
  const handleSaveNewPassword = useCallback(async (newPass: string, currentPass?: string) => {
      console.log('handleSaveNewPassword chamado com nova senha:', newPass, 'e senha atual:', currentPass);
      // Verificar se a senha atual foi fornecida (deve vir do PasswordForm agora)
      if (currentPass === undefined) {
          console.error('Senha atual não fornecida para mudança de senha.');
          toast({
              title: "Erro",
              description: "Erro interno: Senha atual não fornecida.",
              variant: "destructive"
          });
          return;
      }

      setSending(true); // Reutilizando o estado sending, talvez criar um específico para mudança de senha
      setError(''); // Limpa erros anteriores

      try {
        const token = localStorage.getItem('jwt_token'); // Obter token do localStorage
         if (!token) {
           console.error('Token JWT não encontrado no localStorage.');
           toast({
             title: "Erro de autenticação",
             description: "Token JWT não encontrado. Faça login novamente.",
             variant: "destructive"
           });
           setSending(false);
           // Opcional: redirecionar para tela de login principal
           setIsAuthenticated(false); // Garante que a tela de login apareça
           return;
         }

        const response = await fetch(`${BACKEND_URL}/change_password`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`, // Incluir token no cabeçalho
          },
          body: JSON.stringify({ current_password: currentPass, new_password: newPass }),
        });

        const data = await response.json();

        if (response.ok) {
          // Senha alterada com sucesso no backend
          // Não precisamos mais atualizar vigia-creds para o login principal
          // localStorage.setItem('vigia-creds', JSON.stringify({ user: creds.user, pass: hash(newPass) })); // REMOVIDO

          toast({
            title: "Sucesso!",
            description: "Sua senha foi alterada com sucesso.",
          });
          // Opcional: Forçar logout para que o usuário faça login com a nova senha
          localStorage.removeItem('jwt_token');
          setIsAuthenticated(false);
          setShowCredentialsManagement(false); // Fechar tela de gerenciamento

        } else if (response.status === 401) {
           console.error('Erro ao alterar senha: Não autorizado ou senha atual incorreta.');
           setError(data.error || 'Senha atual incorreta ou não autorizado.');
           toast({
             title: "Falha na alteração",
             description: data.error || 'Senha atual incorreta ou não autorizado.',
             variant: "destructive"
           });
        } else {
          console.error('Erro ao alterar senha - Resposta do backend:', data);
          setError(data.error || 'Não foi possível alterar a senha.');
          toast({
            title: "Falha na alteração",
            description: data.error || 'Não foi possível alterar a senha.',
            variant: "destructive"
          });
        }

      } catch (err: any) {
        console.error('Erro de comunicação ao alterar senha:', err); // Loga o erro detalhado
        setError(err.message || 'Erro de comunicação com o backend.');
        toast({
          title: "Erro de comunicação",
          description: "Não foi possível conectar ao backend para alterar a senha.",
          variant: "destructive"
        });
      }
      setSending(false); // Finaliza o estado de envio
  }, [toast]); // Dependência: toast

  // Manter handleForgot, handleVerifyCode, handleResetPassword se o fluxo de recuperação for desejado
  // ATENÇÃO: Estes endpoints no backend (/request_password_reset, /verify_password_reset_code, /reset_password)
  // NÃO estão protegidos por JWT, o que é correto para um fluxo de recuperação ANTES do login.
  // No entanto, a implementação atual no backend ainda usa lógica simples e precisa ser aprimorada para segurança.

  // Modificar handleForgot para usar um username (verificar se o backend suporta username dinâmico ou se 'rosa' é fixo)
  // TODO: Verificar se o backend de recuperação suporta username dinâmico ou se 'rosa' é fixo.
  const RECOVERY_USERNAME = 'rosa'; // Mantendo 'rosa' com ressalva, verificar backend.
  const handleForgot = useCallback(async () => {
    if (!window.confirm('Deseja redefinir sua senha? Um código será enviado para o e-mail cadastrado.')) return;

    setSending(true);
    setRecoveryError('');

    try {
      const response = await fetch(`${BACKEND_URL}/request_password_reset`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: RECOVERY_USERNAME }), // Envia o username
      });

      const data = await response.json();

      if (response.ok) {
        toast({
          title: "Solicitação enviada!",
          description: data.status,
        });
        setRecoveryStep('verify'); // Move para tela de código se a solicitação for bem-sucedida
      } else {
         setRecoveryError(data.error || 'Erro ao solicitar recuperação de senha.');
         toast({
          title: "Falha na solicitação",
          description: data.error || 'Não foi possível solicitar a recuperação de senha.',
          variant: "destructive"
        });
      }

    } catch (err: any) {
      console.error('Erro ao solicitar recuperação de senha:', err); // Loga o erro detalhado
      setRecoveryError(err.message || 'Erro de comunicação com o backend.');
      toast({
        title: "Erro de comunicação",
        description: "Não foi possível conectar ao backend para solicitar recuperação.",
        variant: "destructive"
      });
    }
    setSending(false);
  }, [toast]);

  // Modificar handleVerifyCode para usar RECOVERY_USERNAME
  const handleVerifyCode = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    setSending(true);
    setRecoveryError('');

    try {
      const response = await fetch(`${BACKEND_URL}/verify_password_reset_code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: RECOVERY_USERNAME, code: codeInput.trim() }),
      });

      const data = await response.json();

      if (response.ok) {
        setRecoveryStep('reset'); // Move para redefinir senha se o código for válido
        setRecoveryError('');
        // setCodeInput(''); // REMOVIDO: Não limpar o código aqui para que ele possa ser usado na próxima etapa
        toast({
          title: "Código verificado!",
          description: "Prossiga para redefinir sua senha.",
        });
      } else {
        setRecoveryError(data.error || 'Código incorreto ou expirado.');
         toast({
          title: "Verificação falhou",
          description: data.error || 'Código incorreto ou expirado.',
          variant: "destructive"
        });
      }

    } catch (err: any) {
      console.error('Erro ao verificar código:', err); // Loga o erro detalhado
      setRecoveryError(err.message || 'Erro de comunicação com o backend.');
      toast({
        title: "Erro de comunicação",
        description: "Não foi possível conectar ao backend para verificar o código.",
        variant: "destructive"
      });
    }
    setSending(false);
  }, [codeInput, toast]);

  // Modificar handleResetPassword para usar RECOVERY_USERNAME
  const handleResetPassword = useCallback(async (newPass: string) => {
      console.log('handleResetPassword chamado com nova senha:', newPass);
      console.log('DEBUG Frontend: handleResetPassword - codeInput=', codeInput); // DEBUG
      setSending(true);
      setRecoveryError('');

      try {
        const response = await fetch(`${BACKEND_URL}/reset_password`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          // Usando RECOVERY_USERNAME
          // Usando o valor de codeInput para o código de recuperação
          // Usando newPass diretamente para a nova senha (já vem do PasswordForm)
          body: JSON.stringify({ username: RECOVERY_USERNAME, code: codeInput.trim(), new_password: newPass }),
        });

        console.log('DEBUG Frontend: handleResetPassword - Status da resposta:', response.status); // DEBUG
        console.log('DEBUG Frontend: handleResetPassword - response.ok:', response.ok); // DEBUG

        const data = await response.json();

        if (response.ok) {
          // REMOVIDO: Atualização da senha no localStorage (vigia-creds)
          // localStorage.setItem('vigia-creds', JSON.stringify({ user: DEFAULT_USER, pass: hash(newPass) }));

          setRecoveryStep('none'); // Volta para a tela de login
          setRecoveryError('');
          setCodeInput(''); // Limpar o código APÓS a redefinição bem-sucedida
          toast({
            title: "Sucesso!",
            description: "Sua senha foi redefinida.",
          });
        } else {
          setRecoveryError(data.error || 'Falha ao redefinir senha.');
           toast({
            title: "Redefinição falhou",
            description: data.error || 'Falha ao redefinir senha.',
            variant: "destructive"
          });
        }

      } catch (err: any) {
        console.error('Erro ao redefinir senha:', err); // Loga o erro detalhado
        setRecoveryError(err.message || 'Erro de comunicação com o backend.');
        toast({
          title: "Erro de comunicação",
          description: "Não foi possível conectar ao backend para redefinir a senha.",
          variant: "destructive"
        });
      }
      setSending(false);
  }, [toast, codeInput]); // Manter codeInput como dependência

  // Handler para atualizar o email de recuperação no backend
  // Manter handleUpdateRecoveryEmail, ele já usa o token JWT
  const handleUpdateRecoveryEmail = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    setIsUpdatingEmail(true);
    try {
      const token = localStorage.getItem('jwt_token'); // Obter token do localStorage
       if (!token) {
         console.error('Token JWT não encontrado no localStorage.');
         toast({
           title: "Erro de autenticação",
           description: "Token JWT não encontrado. Faça login novamente.",
           variant: "destructive"
         });
         setIsUpdatingEmail(false);
         // Opcional: redirecionar para tela de login principal
         setIsAuthenticated(false); // Garante que a tela de login apareça
         return;
       }

      const response = await fetch(`${BACKEND_URL}/update_recovery_email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`, // Incluir token no cabeçalho
        },
        body: JSON.stringify({ email: newRecoveryEmail }),
      });

      const data = await response.json();

      if (response.ok) {
        setCurrentRecoveryEmail(newRecoveryEmail);
        toast({
          title: "Sucesso!",
          description: data.status,
        });
      } else if (response.status === 401) {
         console.error('Erro ao atualizar email de recuperação: Não autorizado.');
         toast({
           title: "Falha na atualização",
           description: 'Não autorizado. Faça login novamente.',
           variant: "destructive"
         });
         // Limpar token e forçar login
         localStorage.removeItem('jwt_token');
         setIsAuthenticated(false); // Garante que a tela de login apareça
      } else {
        console.error('Erro ao atualizar email de recuperação - Resposta do backend:', data);
        toast({
          title: "Falha na atualização",
          description: data.status || 'Não foi possível atualizar o e-mail.',
          variant: "destructive"
        });
      }
    } catch (error: any) {
      console.error('Erro de comunicação ao atualizar email de recuperação:', error);
      toast({
        title: "Erro de comunicação",
        description: "Não foi possível conectar ao backend para atualizar o e-mail.",
        variant: "destructive"
      });
    }
    setIsUpdatingEmail(false);
  }, [newRecoveryEmail, toast]); // Dependências: newRecoveryEmail, toast

  console.log('Renderizando Index. Current recoveryStep:', recoveryStep);

  // Prioriza a tela de gerenciamento de credenciais
  // Adicionar verificação de autenticação para mostrar esta tela
  if (showCredentialsManagement && isAuthenticated) {
    console.log('Renderizando: Tela de Gerenciamento de Credenciais');
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-full max-w-md p-8 rounded-lg shadow-lg bg-card border border-border space-y-6">
          <h1 className="text-2xl font-bold text-center">Atualizar Credenciais</h1>

          {/* Seção de Atualizar E-mail */}
          <div>
            <h2 className="text-xl font-semibold mb-4">E-mail de Recuperação</h2>
            <form onSubmit={handleUpdateRecoveryEmail} className="space-y-4">
              <div>
                <Label htmlFor="recovery-email">E-mail Atual</Label>
                <Input
                  id="recovery-email"
                  type="email"
                  value={newRecoveryEmail}
                  onChange={(e) => setNewRecoveryEmail(e.target.value)}
                  placeholder="Digite o novo e-mail de recuperação"
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={isUpdatingEmail}>
                {isUpdatingEmail ? 'Atualizando...' : 'Atualizar E-mail'}
              </Button>
            </form>
             {currentRecoveryEmail && currentRecoveryEmail !== 'Erro ao carregar' && currentRecoveryEmail !== 'Erro de comunicação' && currentRecoveryEmail !== 'Erro: Não autenticado.' && currentRecoveryEmail !== 'Erro: Não autorizado.' && (
                <p className="text-sm text-muted-foreground mt-2 text-center">E-mail configurado atualmente: {currentRecoveryEmail}</p>
             )}
             {(currentRecoveryEmail === 'Erro ao carregar' || currentRecoveryEmail === 'Erro de comunicação' || currentRecoveryEmail === 'Erro: Não autenticado.' || currentRecoveryEmail === 'Erro: Não autorizado.') && (
                 <p className="text-sm text-red-500 mt-2 text-center">{currentRecoveryEmail}. Verifique a conexão com o backend.</p>
             )}
          </div>

          {/* Seção de Alterar Senha */}
          <div>
             <h2 className="text-xl font-semibold mb-4">Alterar Senha</h2>
             {/* Reutiliza o PasswordForm para a lógica de alteração de senha */}
             <PasswordForm
                title=""
                submitText="Salvar nova senha"
                onSubmit={handleSaveNewPassword}
                // Passar props para a senha atual
                currentPassword={currentPasswordChange}
                onCurrentPasswordChange={setCurrentPasswordChange}
                // Não tem cancelar aqui, o botão cancelar é da tela principal de gerenciamento
             />
             {/* Exibir erro de mudança de senha se houver */}
             {error && <div className="text-red-500 text-sm text-center mt-2">{error}</div>}
          </div>

          <Button variant="secondary" className="w-full" onClick={() => setShowCredentialsManagement(false)}>
            Voltar
          </Button>
        </div>
      </div>
    );
  }

  // Prioriza as telas de recuperação de senha
  // Estas telas não devem exigir autenticação JWT, pois são para recuperação ANTES do login
  if (recoveryStep === 'verify') {
    console.log('Renderizando: Tela de Verificação de Código');
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-full max-w-sm p-8 rounded-lg shadow-lg bg-card border border-border">
          <h1 className="text-2xl font-bold text-center mb-6">Recuperação de Senha</h1>
          <form onSubmit={handleVerifyCode} className="space-y-4">
            <div>
              <Label htmlFor="recovery-code">Digite o código enviado para o e-mail</Label>
              <Input
                id="recovery-code"
                type="text"
                className="w-full px-3 py-2 border rounded bg-background border-border focus:outline-none focus:ring-2 focus:ring-primary"
                value={codeInput}
                onChange={e => setCodeInput(e.target.value)}
                required
                maxLength={6}
                autoFocus
              />
            </div>
            {recoveryError && <div className="text-red-500 text-sm text-center">{recoveryError}</div>}
            <Button
              type="submit"
              className="w-full py-2 px-4 bg-primary text-white rounded hover:bg-primary/90 font-semibold transition"
              disabled={sending}
            >
              Verificar código
            </Button>
             <Button type="button" onClick={() => setRecoveryStep('none')} variant="secondary" className="w-full mt-2">Cancelar</Button>
          </form>
        </div>
      </div>
    );
  }

  if (recoveryStep === 'reset') {
    console.log('Renderizando: Tela de Redefinir Senha');
    // Usar PasswordForm restaurado
    return <PasswordForm
      title="Redefinir Senha"
      submitText="Salvar nova senha"
      onSubmit={handleResetPassword}
      onCancel={() => setRecoveryStep('none')}
    />;
  }

  // Se não estiver autenticado e não estiver em nenhum fluxo especial, mostra o login
  // Esta é a tela de login principal que agora usará o backend JWT
  if (!isAuthenticated) {
    console.log('Renderizando: Tela de Login');
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-full max-w-sm p-8 rounded-lg shadow-lg bg-card border border-border">
          <h1 className="text-2xl font-bold text-center mb-6">Vigia - Login</h1>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <Label htmlFor="username">Usuário</Label>
              <Input
                id="username"
                type="text"
                className="w-full px-3 py-2 border rounded bg-background border-border focus:outline-none focus:ring-2 focus:ring-primary"
                value={user}
                onChange={e => setUser(e.target.value)}
                autoFocus
                autoComplete="username"
                required
              />
            </div>
            <div>
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                className="w-full px-3 py-2 border rounded bg-background border-border focus:outline-none focus:ring-2 focus:ring-primary"
                value={pass}
                onChange={e => setPass(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            {error && <div className="text-red-500 text-sm text-center">{error}</div>}
            <Button
              type="submit"
              className="w-full py-2 px-4 bg-primary text-white rounded hover:bg-primary/90 font-semibold transition"
              disabled={sending}
            >
              Entrar
            </Button>
            {/* Manter o botão de esqueci a senha se o fluxo de recuperação for desejado */}
            <Button
              type="button"
              className="w-full py-2 px-4 bg-secondary text-primary rounded border border-primary hover:bg-primary/10 font-semibold transition"
              onClick={handleForgot}
              disabled={sending}
            >
              Esqueci a senha
            </Button>
          </form>
          <div className="text-center text-xs text-muted-foreground mt-8">
            © 2025 - flly. Todos os direitos reservados.
          </div>
        </div>
      </div>
    );
  }

  // Se estiver autenticado e não estiver em nenhum fluxo especial, mostra o sistema principal
  console.log('Renderizando: Sistema Vigia');
  return (
    <>
      <SecurityMonitor />
      <div className="fixed bottom-4 right-4 z-50">
        <Button
          className="py-2 px-4 bg-primary text-white rounded shadow hover:bg-primary/90 font-semibold transition"
          onClick={() => setShowCredentialsManagement(true)} // Mudei para mostrar a nova tela
        >
          Credenciais
        </Button>
      </div>
    </>
  );
};

export default Index;
