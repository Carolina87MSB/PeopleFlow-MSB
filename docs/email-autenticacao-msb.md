# E-mail de autenticação em português, com identidade MSB

**Situação: proposta pronta, NÃO aplicada.** O e-mail de acesso é configurado no painel do Supabase, não no código, e este projeto Supabase é **compartilhado** com o Portal SST (os dois portais entram por e-mail, com `signInWithOtp`). Por isso a mudança alcança os dois, e quem a aplica é você, no painel.

## O que a mudança resolve
1. **Código de acesso.** Hoje o e-mail traz só o link. O link abre no aplicativo de onde o e-mail foi lido (Outlook, por exemplo), e a sessão fica **naquele** navegador. Ao escanear o QR de outro treinamento no navegador do celular, o colaborador precisaria entrar de novo. Com o código no e-mail, ele digita o código na própria página do QR e a sessão fica no navegador que ele já usa.
2. **Português e identidade MSB.** Texto claro, assinatura e cores da MSB.

## Impacto nos demais fluxos
- O modelo "Magic Link" vale para todo login por e-mail do projeto (PeopleFlow, Portal SST, página de presença). O texto abaixo é **genérico** ("Acesso ao portal MSB"): não cita treinamento nem PeopleFlow.
- O link continua exatamente igual (`{{ .ConfirmationURL }}`), então o login atual dos dois portais não muda. O código é um acréscimo.
- Os modelos "Confirm signup", "Invite" e "Reset password" não são usados (as contas são provisionadas, `shouldCreateUser: false`) e não precisam ser alterados.
- O código vale pelo mesmo tempo do link (padrão do Supabase, em *Authentication → Providers → Email → Email OTP Expiration*). O tamanho padrão é 6 dígitos; a página aceita de 6 a 10.

## Como aplicar (no painel do Supabase)
1. Antes de mexer, **copie o modelo atual** (para poder desfazer).
2. *Authentication → Email Templates → Magic Link*.
3. **Assunto:** `Seu acesso ao portal MSB`
4. Cole o HTML abaixo no corpo.
5. Salve. Teste com a sua própria conta: peça o acesso pelo Portal PeopleFlow e depois pelo Portal SST; os dois devem continuar entrando pelo link.
6. Para testar o código: abra a página de presença de um QR válido, peça o e-mail, e digite o código na própria página.

Se o painel não aceitar HTML personalizado ou se houver SMTP próprio, o remetente ("MSB") é configurado em *Authentication → SMTP Settings*.

## Corpo do e-mail (HTML)

```html
<div style="background:#eef5f7;padding:24px 12px;font-family:Montserrat,Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #d9e4e8;border-radius:12px;">
    <tr>
      <td style="padding:24px 24px 8px 24px;">
        <img src="https://DOMINIO-DO-PEOPLEFLOW/assets/msb-logo.png" alt="MSB — Medical System do Brasil" height="34" style="height:34px;border:0;">
      </td>
    </tr>
    <tr>
      <td style="padding:8px 24px 0 24px;color:#33485a;">
        <h1 style="margin:0 0 8px 0;font-size:20px;line-height:1.3;color:#33485a;">Seu acesso ao portal MSB</h1>
        <p style="margin:0 0 16px 0;font-size:14px;line-height:1.5;color:#51606b;">
          Recebemos um pedido de acesso com este e-mail. Se foi você, use uma das opções abaixo.
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:0 24px;">
        <a href="{{ .ConfirmationURL }}" style="display:block;text-align:center;background:#17a398;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:14px;border-radius:10px;">Entrar no portal</a>
        <p style="margin:8px 0 0 0;font-size:12px;color:#7d8c93;text-align:center;">O link funciona no aparelho e no aplicativo em que você abrir este e-mail.</p>
      </td>
    </tr>
    <tr>
      <td style="padding:20px 24px 0 24px;">
        <p style="margin:0 0 8px 0;font-size:14px;line-height:1.5;color:#51606b;">
          <strong>Prefere digitar um código?</strong> Se abriu este e-mail em outro aplicativo (como o Outlook), volte ao navegador e digite:
        </p>
        <p style="margin:0;text-align:center;font-size:28px;letter-spacing:6px;font-weight:700;color:#33485a;background:#eef5f7;border-radius:10px;padding:12px;">{{ .Token }}</p>
      </td>
    </tr>
    <tr>
      <td style="padding:20px 24px 24px 24px;">
        <p style="margin:0;font-size:12px;line-height:1.5;color:#7d8c93;">
          O link e o código vencem em pouco tempo e só podem ser usados uma vez. Se você não pediu este acesso, ignore este e-mail: ninguém entra sem o link ou o código.
        </p>
      </td>
    </tr>
  </table>
</div>
```

Troque `DOMINIO-DO-PEOPLEFLOW` pelo endereço público do PeopleFlow: o arquivo `/assets/msb-logo.png` existe lá (o Portal SST não tem esse arquivo, então não use `{{ .SiteURL }}`, que pode apontar para ele). Se o logo não aparecer no leitor de e-mail, só o texto alternativo é exibido, sem afetar o link nem o código.

## Limite técnico: onde o link cai
Quando o link é aberto em **outro navegador** (Outlook, por exemplo), o login acontece lá, e o retorno ao treinamento depende de a URL `https://<domínio>/participar/*` estar liberada em *Authentication → URL Configuration → Redirect URLs*. Se não estiver, o Supabase manda para a raiz do portal. A página já trata o caso do **mesmo** navegador; no caso de outro navegador o caminho garantido é o **código** (acima). Recomendação: incluir `https://<domínio>/participar/**` nas Redirect URLs.
