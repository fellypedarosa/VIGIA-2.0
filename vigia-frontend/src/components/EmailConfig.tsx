import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Mail, Settings, ExternalLink, CheckCircle, AlertTriangle } from 'lucide-react';

export const EmailConfig: React.FC = () => {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    enabled: false,
    toEmail: '',
    smtpServer: '',
    smtpPort: 465,
    smtpUser: '',
    smtpPassword: '',
  });
  const [showInstructions, setShowInstructions] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    const fetchConfig = async () => {
      setIsLoading(true);
      try {
        const token = localStorage.getItem('jwt_token'); // Use the correct key 'jwt_token'
        if (!token) {
          throw new Error('No access token found');
        }

        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` // Add Authorization header
        };

        // Use server IP for backend endpoints
        const emailRes = await fetch('https://api-vigia.fellyperosa.com.br/get_recovery_email', { headers });
        if (!emailRes.ok) {
            throw new Error(`HTTP error! status: ${emailRes.status}`);
        }
        const emailData = await emailRes.json();

        const smtpRes = await fetch('https://api-vigia.fellyperosa.com.br/get_smtp_config', { headers });
         if (!smtpRes.ok) {
            throw new Error(`HTTP error! status: ${smtpRes.status}`);
        }
        const smtpData = await smtpRes.json();

        setFormData({
          enabled: emailData.recovery_email !== null && emailData.recovery_email !== '',
          toEmail: emailData.recovery_email || '',
          smtpServer: smtpData.smtp_server || '',
          smtpPort: smtpData.smtp_port || 465,
          smtpUser: smtpData.smtp_user || '',
          smtpPassword: smtpData.smtp_password || '',
        });
      } catch (error: any) {
        console.error('Erro ao carregar configurações:', error);
        toast({
          title: "Erro",
          description: `Não foi possível carregar as configurações de email. ${error.message || ''} Verifique se o backend está rodando, acessível pelo IP e se você está logado.`, // Added error message and login hint
          variant: "destructive"
        });
      } finally {
        setIsLoading(false);
      }
    };
    fetchConfig();
  }, [toast]);

  const handleSave = async () => {
    setIsSending(true);
    try {
        const token = localStorage.getItem('jwt_token'); // Use the correct key 'jwt_token'
        if (!token) {
          throw new Error('No access token found');
        }

        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` // Add Authorization header
        };

      // Use server IP for backend endpoints
      await fetch('https://api-vigia.fellyperosa.com.br/update_recovery_email', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ email: formData.enabled ? formData.toEmail : null }),
      });

      // Use server IP for backend endpoints
      await fetch(`${import.meta.env.VITE_API_URL}/update_smtp_config`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          smtp_server: formData.smtpServer,
          smtp_port: parseInt(formData.smtpPort as any),
          smtp_user: formData.smtpUser,
          smtp_password: formData.smtpPassword,
        }),
      });

      toast({
        title: "Configurações salvas",
        description: "As configurações de email foram salvas com sucesso",
      });
    } catch (error: any) {
      console.error('Erro ao salvar configurações:', error);
      toast({
        title: "Erro",
        description: `Não foi possível salvar as configurações de email. ${error.message || ''} Verifique se o backend está rodando, acessível pelo IP e se você está logado.`, // Added error message and login hint
        variant: "destructive"
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleTest = async () => {
    setIsSending(true);
    try {
        const token = localStorage.getItem('jwt_token'); // Use the correct key 'jwt_token'
        if (!token) {
          throw new Error('No access token found');
        }

        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` // Add Authorization header
        };

      // Use server IP for backend endpoint
      const response = await fetch(`${import.meta.env.VITE_API_URL}/test_smtp_connection`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          smtp_server: formData.smtpServer,
          smtp_port: parseInt(formData.smtpPort as any),
          smtp_user: formData.smtpUser,
          smtp_password: formData.smtpPassword,
          to_email: formData.toEmail, // Send destination email for test
        }),
      });

      const result = await response.json();

      if (response.ok) {
        toast({
          title: "Teste bem-sucedido!",
          description: result.message || "O email de teste foi enviado com sucesso!",
        });
      } else {
        toast({
          title: "Erro no teste",
          description: result.error || "Não foi possível enviar o email de teste. Verifique as configurações e se o backend está rodando e acessível pelo IP.",
          variant: "destructive"
        });
      }
    } catch (error: any) {
      console.error('Erro ao testar conexão SMTP:', error);
      toast({
        title: "Erro",
        description: `Ocorreu um erro ao tentar testar a conexão SMTP. ${error.message || ''} Verifique se o backend está rodando, acessível pelo IP e se você está logado.`, // Added error message and login hint
        variant: "destructive"
      });
    } finally {
      setIsSending(false);
    }
  };

  const isConfigured = formData.enabled && formData.smtpServer && formData.smtpPort && formData.smtpUser && formData.smtpPassword;

  if (isLoading) {
    return <Card><CardHeader><CardTitle>Carregando configurações...</CardTitle></CardHeader></Card>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Configurações de Email
          {isConfigured && (
            <CheckCircle className="h-4 w-4 text-monitoring-active" />
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="email-enabled">Alertas por email ativados</Label>
          <Switch
            id="email-enabled"
            checked={formData.enabled}
            onCheckedChange={(checked) =>
              setFormData(prev => ({ ...prev, enabled: checked }))
            }
          />
        </div>

        {formData.enabled && (
          <>
            <div className="space-y-2">
              <Label htmlFor="to-email">Email de destino (Recuperação)</Label>
              <Input
                id="to-email"
                type="email"
                placeholder="seu@email.com"
                value={formData.toEmail}
                onChange={(e) =>
                  setFormData(prev => ({ ...prev, toEmail: e.target.value }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="smtp-server">Servidor SMTP</Label>
              <Input
                id="smtp-server"
                placeholder="smtp.example.com"
                value={formData.smtpServer}
                onChange={(e) =>
                  setFormData(prev => ({ ...prev, smtpServer: e.target.value }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="smtp-port">Porta SMTP</Label>
              <Input
                id="smtp-port"
                type="number"
                placeholder="465"
                value={formData.smtpPort}
                onChange={(e) =>
                  setFormData(prev => ({ ...prev, smtpPort: parseInt(e.target.value) || 0 }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="smtp-user">Usuário SMTP</Label>
              <Input
                id="smtp-user"
                placeholder="seu_usuario@example.com"
                value={formData.smtpUser}
                onChange={(e) =>
                  setFormData(prev => ({ ...prev, smtpUser: e.target.value }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="smtp-password">Senha SMTP</Label>
              <Input
                id="smtp-password"
                type="password"
                placeholder="sua_senha_smtp"
                value={formData.smtpPassword}
                onChange={(e) =>
                  setFormData(prev => ({ ...prev, smtpPassword: e.target.value }))
                }
              />
            </div>

            <div className="flex gap-2">
              <Button onClick={handleSave} className="flex-1" disabled={isSending}>
                {isSending ? 'Salvando...' : 'Salvar Configurações'}
              </Button>
              <Button
                onClick={handleTest}
                disabled={isSending || !formData.smtpServer || !formData.smtpPort || !formData.smtpUser || !formData.smtpPassword || !formData.toEmail}
                variant="outline"
              >
                {isSending ? 'Testando...' : 'Testar SMTP'}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};