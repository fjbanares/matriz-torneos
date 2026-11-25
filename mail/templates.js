// Textos de los correos. Los enlaces apuntan a la página de la aplicación.

const linkFor = (token) => `${process.env.APP_URL}/#set-password=${token}`;

function inviteEmail({ name, token }) {
  return {
    subject: 'Te han invitado a El Cobrador del Waaagh',
    text: `Hola ${name},

Te han dado acceso a El Cobrador del Waaagh. Para entrar, elige tu contraseña en este enlace:

${linkFor(token)}

El enlace caduca en 7 días y solo se puede usar una vez.

Si no esperabas este correo, puedes ignorarlo.`,
  };
}

function resetEmail({ name, token }) {
  return {
    subject: 'Restablece tu contraseña de El Cobrador del Waaagh',
    text: `Hola ${name},

Hemos recibido una petición para restablecer tu contraseña. Puedes elegir una nueva en este enlace:

${linkFor(token)}

El enlace caduca en 1 hora y solo se puede usar una vez. Si no lo pediste tú, ignora este correo: tu contraseña no cambiará.`,
  };
}

module.exports = { inviteEmail, resetEmail };
