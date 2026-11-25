// Envío de correo transaccional con la API de Brevo.
// Variables: BREVO_API_KEY (clave de API) y MAIL_FROM (remitente verificado en Brevo).

async function sendMail({ to, subject, text }) {
  const apiKey = process.env.BREVO_API_KEY;
  const from = process.env.MAIL_FROM;
  if (!apiKey || !from) throw new Error('Faltan BREVO_API_KEY o MAIL_FROM');

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { email: from, name: 'El Cobrador del Waaagh' },
      to: [{ email: to }],
      subject,
      textContent: text,
    }),
  });
  if (!res.ok) throw new Error(`Brevo respondió con ${res.status}`);
}

module.exports = { sendMail };
