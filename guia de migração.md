Passo 1: Preparação do Servidor de Serviços (10.0.0.45)
Objetivo: Permitir que os novos servidores (.46 e .47) se conectem ao Banco de Dados.

Como este servidor já está em produção, vamos apenas ajustar as permissões de acesso.

Acesse o servidor 10.0.0.45 via SSH.
Edite o arquivo pg_hba.conf do PostgreSQL (O caminho pode variar, geralmente /etc/postgresql/13/main/pg_hba.conf ou similar):
bash
nano /etc/postgresql/13/main/pg_hba.conf
Adicione as permissões para os novos IPs:
text
# Permite acesso do Portal Cativo
host    all             all             10.0.0.46/32            md5
# Permite acesso do Sistema Admin
host    all             all             10.0.0.47/32            md5
Verifique o postgresql.conf: Certifique-se de que listen_addresses está definido como '*' ou inclui os IPs novos.
Reinicie o PostgreSQL:
bash
systemctl restart postgresql
InfluxDB:
*   **Se usar InfluxDB v2 (arquivo `config.toml`):** Edite `/etc/influxdb/config.toml` e adicione/altere a linha: `http-bind-address = ":8086"`
*   **Se usar InfluxDB v1 (arquivo `influxdb.conf`):** Edite `/etc/influxdb/influxdb.conf` na seção `[http]` para `bind-address = ":8086"`
Reinicie o serviço: `systemctl restart influxdb`

**Configuração de Firewall no Servidor de Serviços (.45):**
Para garantir comunicação total entre a infraestrutura:
```bash
sudo ufw allow from 10.0.0.46 comment "Portal Cativo"
sudo ufw allow from 10.0.0.47 comment "Admin System"
sudo ufw allow from 172.16.12.0/24 comment "Rede MikroTik"
```
Passo 2: Configuração do Servidor Admin (10.0.0.47)
Objetivo: Instalar o sistema, configurar firewall e inicialização automática.

Acesse o servidor 10.0.0.47 via SSH.
Instale as dependências (Node.js, PM2, Git, UFW):
bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg git ufw
# Adiciona o repositório NodeSource para garantir a instalação do Node.js (v20 LTS)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
# Verifique a versão instalada (Recomendado: v18.x ou v20.x)
node -v
sudo npm install -g pm2
Copie os arquivos do projeto:
Use scp ou git clone para colocar o código do PainelAdministradorMain em /var/www/admin-panel (ou diretório de sua preferência).
Configure as Variáveis de Ambiente (.env): Crie ou edite o arquivo .env na raiz do projeto Admin:
env
 Show full code block 
PORT=3000
# Conexão com o Servidor de Serviços (.45)
DB_HOST=10.0.0.45
DB_USER=seu_usuario_postgres
DB_PASSWORD=sua_senha_postgres
DB_DATABASE=nome_do_banco
DB_PORT=5432

# InfluxDB (.45)
INFLUX_URL=http://10.0.0.45:8086
INFLUX_TOKEN=seu_token
INFLUX_ORG=sua_org
INFLUX_BUCKET=seu_bucket

# JWT Secret
JWT_SECRET=sua_chave_secreta_segura
Instale as dependências do projeto:
bash
# Entre na pasta backend onde está o package.json
cd /var/www/PainelAdministradorMainMain/backend
# Corrige a versão da biblioteca ping para ser compatível com Node.js 20
npm install ping@0.4.4
npm ci --production
# Se usar node-routeros, certifique-se que está instalado
npm install node-routeros
Configuração do Firewall (UFW):
bash
 Show full code block 
# Habilita o UFW
sudo ufw enable

# Libera SSH (cuidado para não se trancar fora)
sudo ufw allow 22/tcp

# Libera comunicação irrestrita entre os servidores e MikroTik
sudo ufw allow from 10.0.0.45 comment "Servidor Servicos"
sudo ufw allow from 10.0.0.46 comment "Portal Cativo"
sudo ufw allow from 172.16.12.0/24 comment "Rede MikroTik"

# 3. Seus IPs de gestão (ex: sua máquina local)
# sudo ufw allow from SEU_IP to any port 3000
Inicialização Automática (PM2):
bash
 Show full code block 
# Inicia a aplicação
pm2 start backend/server.js --name "admin-system"

# Gera o script de startup (copie e cole o comando que o terminal exibir)
pm2 startup

# Salva a lista de processos
pm2 save
Passo 3: Atualização do Portal Cativo (10.0.0.46)
Objetivo: Atualizar para a versão EJS e integrar com o Admin.

Acesse o servidor 10.0.0.46 via SSH.
Backup da versão atual (Segurança):
bash
# 1. Pare e desative o serviço antigo encontrado
sudo systemctl stop rota-hotspot-backend.service
sudo systemctl disable rota-hotspot-backend.service

# Verificação: Confirme se parou
# Deve mostrar "Active: inactive (dead)"
systemctl status rota-hotspot-backend.service
# Certifique-se que o processo sumiu
ps aux | grep node

# 2. Instale o PM2 para gerenciar a nova versão
sudo npm install -g pm2
# 3. Prepare a pasta para a nova versão
sudo mkdir -p /var/www/portal-cativo
sudo chown -R $USER:$USER /var/www/portal-cativo
Copie o novo sistema (Versão EJS): Transfira os arquivos da nova versão para /var/www/portal-cativo.
Instale as dependências:
bash
cd /var/www/portal-cativo
npm ci --production
Configure o .env do Portal: Este passo é crucial para a integração das campanhas.
env
 Show full code block 
PORT=8081 # Porta configurada para produção (compatível com MikroTik)

# Conexão com o Banco (.45) para Login/Cadastro
DB_HOST=10.0.0.45
DB_USER=seu_usuario
DB_PASSWORD=sua_senha
DB_DATABASE=nome_do_banco

# Integração com o Admin (.47) para Campanhas
# O portal vai consultar esta URL para saber qual campanha exibir
ADMIN_API_URL=http://10.0.0.47:3000
Configuração do Firewall (UFW):
bash
# Instala o UFW antes de configurar
sudo apt update && sudo apt install -y ufw
sudo ufw allow 22/tcp

# Libera comunicação irrestrita entre os servidores e MikroTik
sudo ufw allow from 10.0.0.45 comment "Servidor Servicos"
sudo ufw allow from 10.0.0.47 comment "Admin System"
sudo ufw allow from 172.16.12.0/24 comment "Rede MikroTik"

# Libera acesso para os usuários vindos dos MikroTiks (Rede dos clientes)
# Porta do Portal (8081)
sudo ufw allow 8081/tcp
sudo ufw enable
Inicialização Automática:
bash
cd /var/www/portal-cativo/backend
pm2 start server.js --name "portal-hotspot"
# Gera o script de inicialização do sistema
pm2 startup
pm2 save

# Verificação da Inicialização Automática:
# 1. Confirme se o processo aparece na lista com status 'online'
pm2 list
# 2. Confirme se o serviço do sistema foi criado e está ativo (enabled/active)
systemctl status pm2-root

# Verifique os logs para garantir que conectou ao Banco e ao Admin
pm2 logs portal-hotspot

### Checklist de Validação do Portal (.46):
1. **Processo Novo:** `ps aux | grep node` deve mostrar `/var/www/portal-cativo/...` (Confirmado).
2. **Processo Antigo:** Não deve aparecer nada de `/home/rotahotspotportal/...` (Confirmado).
3. **Logs:** `pm2 logs` sem erros de conexão.

Passo 4: Configuração no MikroTik (Walled Garden)
Objetivo: Permitir que o usuário não autenticado carregue o portal e as imagens das campanhas.

No WinBox ou Terminal do MikroTik, você precisa liberar o acesso aos IPs dos servidores antes da autenticação, senão o portal não carrega ou as imagens das campanhas (hospedadas no Admin .47) não aparecem.

mikrotik
/ip hotspot walled-garden ip
add dst-address=10.0.0.46 comment="Servidor Portal Cativo"
add dst-address=10.0.0.47 comment="Servidor Admin (API e Imagens Campanhas)"
Passo 5: Validação do Fluxo (Checklist)
Teste de Banco de Dados:

No servidor Admin (.47), tente conectar ao banco no .45.
No servidor Portal (.46), tente conectar ao banco no .45.
Teste de API de Campanhas:

No servidor Portal (.46), faça um curl para o Admin: curl http://10.0.0.47:3000/api/public/campaigns/check?routerName=RT-TESTE
Deve retornar JSON com a campanha ou padrão.
Teste do Usuário Final:

Conecte um dispositivo ao Wi-Fi.
O MikroTik deve redirecionar para http://10.0.0.46:3001/...
O Portal deve carregar.
O Portal deve consultar o Admin (.47) internamente e exibir a campanha correta (baseada no parâmetro mac ou identificador do roteador na URL).
Ao fazer login, o Portal valida no DB (.45).
Ao autorizar, o Portal manda comando para o MikroTik liberar a internet.
Resumo de IPs e Portas
Servidor	IP	Porta Serviço	Quem Acessa?
Admin	10.0.0.47	3000 (Node)	Portal (.46), Admins, MikroTiks (Monitoramento)
Portal	10.0.0.46	8081 (Node)	Usuários (Wi-Fi), MikroTiks (Redirect)
Serviços	10.0.0.45	5432 (PG), 8086 (Influx)	Admin (.47), Portal (.46), FreeRADIUS (Local)