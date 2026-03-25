# Checklist de Deploy Seguro

## 1) Pré-deploy (T-1 dia até T-30 min)

- [ ] Branch/release criada e congelada (sem novas mudanças fora do escopo).
- [ ] Escopo da etapa validado (o que entra / o que não entra).
- [ ] Responsáveis definidos: execução, validação funcional, decisão de rollback.
- [ ] Backup realizado:
  - [ ] Banco de dados
  - [ ] `.env`/segredos
  - [ ] Artefato/versão atual da aplicação
- [ ] Plano de rollback testado em ambiente de homologação.
- [ ] Janela de deploy aprovada e comunicada.
- [ ] Monitoramento pronto:
  - [ ] Logs centralizados
  - [ ] Taxa de erro (4xx/5xx)
  - [ ] Latência p95/p99
  - [ ] CPU/Memória
- [ ] Feature flags configuradas (se aplicável).
- [ ] Migrações de banco revisadas (compatíveis com rollback).
- [ ] Smoke test documentado e atualizado.

## 2) Durante o deploy (T0)

- [ ] Confirmar que ninguém está fazendo alteração em produção.
- [ ] Executar deploy da versão planejada.
- [ ] Rodar migrações (se houver) na ordem correta.
- [ ] Validar healthcheck da aplicação (`/health` ou equivalente).
- [ ] Verificar inicialização sem erro crítico no log.
- [ ] Habilitar release canário (10% ou grupo controlado), se aplicável.
- [ ] Rodar smoke test rápido em produção:
  - [ ] Login/logout
  - [ ] Rotas protegidas/permissões
  - [ ] Abertura e atualização de ticket
  - [ ] Upload de anexo permitido/bloqueado corretamente
  - [ ] Dashboard e relatórios principais
- [ ] Monitorar 30-60 min após subida:
  - [ ] Sem pico de 5xx
  - [ ] Sem aumento anormal de latência
  - [ ] Sem erro funcional crítico

## 3) Pós-deploy (T+1h até T+24h)

- [ ] Expandir canário para 50% e depois 100% (se estável).
- [ ] Repetir smoke test completo.
- [ ] Confirmar com time de negócio que fluxos críticos estão operando.
- [ ] Revisar logs de erro e alertas nas primeiras 2 horas.
- [ ] Registrar resultado da release (sucesso/incidentes/ações).
- [ ] Encerrar janela somente após estabilidade validada.

## Critérios de Go / No-Go

- [ ] **GO**: smoke 100% aprovado + métricas estáveis + sem erro crítico.
- [ ] **NO-GO**: falha de autenticação, indisponibilidade de ticket/upload, pico contínuo de 5xx.
- [ ] **Rollback imediato** se incidente bloqueante durar > 5 minutos.

## Checklist de Rollback (executar se necessário)

- [ ] Acionar responsável e registrar horário do incidente.
- [ ] Desabilitar feature flag da mudança (se existir).
- [ ] Reverter aplicação para versão anterior.
- [ ] Reverter migração de banco (se aplicável e seguro).
- [ ] Restaurar backup (se necessário).
- [ ] Validar healthcheck e smoke test mínimo.
- [ ] Comunicar retorno de serviço e status final.
- [ ] Abrir pós-mortem curto com causa, impacto e prevenção.

## Evidências mínimas (auditoria interna)

- [ ] Print/log do backup concluído.
- [ ] Versão implantada (tag/commit).
- [ ] Resultado do smoke test (ok/falha por item).
- [ ] Gráfico de erro/latência pré e pós deploy.
- [ ] Registro de decisão (go/no-go ou rollback).
