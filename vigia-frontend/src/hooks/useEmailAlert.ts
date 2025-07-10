import { useState, useCallback } from 'react';

export const useEmailAlert = () => {
  const [isSending, setIsSending] = useState(false);

  const sendAlert = useCallback(async (alertData: { timestamp: string; score: number; image: string; }) => {
    setIsSending(true);
    try {
      // Use server IP for backend endpoint
      const response = await fetch('http://100.82.178.78:5000/send_alert_email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(alertData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Erro ao enviar alerta:', errorData.error);
        return false;
      }

      console.log('Alerta enviado com sucesso via backend.');
      return true;
    } catch (error) {
      console.error('Erro ao chamar endpoint de envio de alerta:', error);
      return false;
    } finally {
      setIsSending(false);
    }
  }, []);

  return {
    sendAlert,
    isSending,
  };
};