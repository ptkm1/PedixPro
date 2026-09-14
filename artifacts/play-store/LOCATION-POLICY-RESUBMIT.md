# Checklist — reenvio Play Store (Localização)

Após o build `1.0.1` / `versionCode` 5 (ou o valor auto-incrementado pelo EAS):

## 1. Publicar política atualizada

1. Fazer deploy do site (`apps/site`) para que `https://pedixpro.com.br/privacidade` reflita o art. 9 (Localização) atualizado.
2. Abrir a URL no navegador e confirmar a seção **Localização** (foreground + background).

## 2. Play Console — App content

1. **Política de Privacidade** → confirmar URL `https://pedixpro.com.br/privacidade` → Salvar.
2. **Data safety**
   - Location: Precise location (and Approximate if applicable)
   - Collected: Yes
   - Shared: Yes — with the user’s organization (not sold; not for ads)
   - Purpose: App functionality
   - Ephemeral: No (short retention for route history)
3. **Sensitive permissions / Background location** (se solicitado)
   - Justificativa: “Rastreamento de rota do vendedor sob ativação voluntária, para a gestão acompanhar visitas comerciais.”
4. **Visão geral da publicação** → Enviar alterações / nova versão para revisão.

## 3. Validar no APK antes de enviar

1. Instalar build de produção.
2. Abrir **Rota** → **não** deve aparecer o diálogo do Android sozinho.
3. Tocar **Atualizar GPS** → disclosure in-app → só então o prompt do SO.
4. Ativar rastreamento → disclosure de background → prompts FG (se faltar) e BG.
5. Cadastro de cliente → capturar GPS → disclosure → prompt do SO.

## 4. Build

```bash
cd apps/mobile && eas build --platform android --profile production
```

`eas.json` production tem `autoIncrement: true` — se o remote versionCode for maior que 5, o EAS prevalece.
