// proxy.conf.js (renombra el archivo)
// ⚠️ TEMPORAL: target apuntando a Development, ver aviso en environment.prod.ts.
module.exports = {
  '/api': {
    target: 'https://webapiartibusinessdevelopment-e8htgkdhhhfpbeem.westeurope-01.azurewebsites.net',
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