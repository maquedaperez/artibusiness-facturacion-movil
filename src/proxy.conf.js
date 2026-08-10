// proxy.conf.js (renombra el archivo)
module.exports = {
  '/api': {
    target: 'https://webapiartibusiness-dvh6d7b8a7c9dsfr.westeurope-01.azurewebsites.net',
    secure: true,
    changeOrigin: true,
    logLevel: 'debug',
    cookieDomainRewrite: 'localhost',
    onProxyRes: function (proxyRes) {
      const setCookie = proxyRes.headers['set-cookie'];
      if (setCookie) {
        proxyRes.headers['set-cookie'] = setCookie.map(cookie =>
          cookie
            .replace(/;\s*Secure/gi, '')
            .replace(/;\s*SameSite=None/gi, '')
        );
      }
    }
  },
  '/config-api': {
    target: 'https://configurationapidispatcher-h2g0g4amcgdmaddh.westeurope-01.azurewebsites.net',
    secure: true,
    changeOrigin: true,
    pathRewrite: { '^/config-api': '/api' },
  }
};