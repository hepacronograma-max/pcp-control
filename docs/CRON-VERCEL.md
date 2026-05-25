# Cron Vercel — polling Omie

## Configuração no repositório

`vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/omie-poll",
      "schedule": "*/15 * * * *"
    }
  ]
}
```

## Variáveis obrigatórias na Vercel

| Variável | Uso |
|----------|-----|
| `CRON_SECRET` | Header `X-Cron-Secret` na chamada do cron |
| `OMIE_APP_KEY` / `OMIE_APP_SECRET` | API Omie no poll |
| `OMIE_ETAPA_PCP` | Etapa filtrada |
| `OMIE_INTEGRATION_MODE` | `shadow` ou `active` |
| `SUPABASE_SERVICE_ROLE_KEY` | Gravação no banco |

A Vercel envia o cron automaticamente **sem** header customizado em planos padrão.

### Problema: Vercel Cron sem header

Opções:

1. **Vercel Cron + Authorization** (se disponível no seu plano): configurar secret no dashboard.  
2. **Cron externo** (cron-job.org, GitHub Actions) chamando:

```bash
curl -s -H "X-Cron-Secret: SEU_CRON_SECRET" \
  "https://pcp-control.vercel.app/api/cron/omie-poll"
```

3. Ajustar temporariamente a rota para aceitar também `Authorization: Bearer <CRON_SECRET>` (já suportado).

> Após deploy, confira em Vercel → Project → Settings → Cron Jobs se o job aparece ativo.

## Teste manual

```powershell
$secret = "seu-cron-secret"
Invoke-WebRequest -Uri "https://pcp-control.vercel.app/api/cron/omie-poll" `
  -Headers @{ "X-Cron-Secret" = $secret }
```

Resposta esperada: JSON `{ ok: true, encontrados, criados, ... }`.

## Relatório

Último poll em `omie_sync_state.last_poll_report` e no painel `/admin/omie`.
