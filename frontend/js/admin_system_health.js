// Ficheiro: frontend/js/admin_system_health.js

if (window.initSystemHealthPage) {
    console.warn("Tentativa de carregar admin_system_health.js múltiplas vezes.");
} else {
    window.initSystemHealthPage = () => {

        const loadHealthData = async (showLoader = false, checkRemote = false) => {
            if (showLoader && window.showPagePreloader) {
                window.showPagePreloader('A verificar saúde do sistema...');
            }

            // Feedback visual no botão de verificação manual
            const checkBtn = document.getElementById('checkRemoteServersBtn');
            if (checkRemote && checkBtn) {
                checkBtn.disabled = true;
                checkBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando...';
            }

            try {
                const response = await apiRequest(`/api/dashboard/health?checkRemote=${checkRemote}`);
                if (!response.success) throw new Error(response.message);
                const data = response.data;

                // PostgreSQL
                const pgCard = document.getElementById('pgHealthCard');
                const pgText = document.getElementById('pgStatusText');
                const pgDetails = document.getElementById('pgStatusDetails');
                
                if (pgCard && pgText && pgDetails) {
                    if (data.postgres.connected) {
                        const icon = pgCard.querySelector('.stat-card-icon');
                        if (icon) icon.className = 'stat-card-icon color-green';
                        pgText.textContent = 'Online';
                        pgText.style.color = '#38a169';
                        pgDetails.textContent = 'Conexão estável';
                    } else {
                        const icon = pgCard.querySelector('.stat-card-icon');
                        if (icon) icon.className = 'stat-card-icon color-red';
                        pgText.textContent = 'Offline';
                        pgText.style.color = '#e53e3e';
                        pgDetails.textContent = data.postgres.error || 'Erro desconhecido';
                    }
                }

                // InfluxDB
                const influxCard = document.getElementById('influxHealthCard');
                const influxText = document.getElementById('influxStatusText');
                const influxDetails = document.getElementById('influxStatusDetails');
                
                if (influxCard && influxText && influxDetails) {
                    if (data.influx.connected) {
                        const icon = influxCard.querySelector('.stat-card-icon');
                        if (icon) icon.className = 'stat-card-icon color-purple';
                        influxText.textContent = 'Online';
                        influxText.style.color = '#38a169';
                        influxDetails.textContent = 'Métricas em tempo real ativas';
                    } else {
                        const icon = influxCard.querySelector('.stat-card-icon');
                        if (icon) icon.className = 'stat-card-icon color-red';
                        influxText.textContent = 'Offline';
                        influxText.style.color = '#e53e3e';
                        influxDetails.textContent = data.influx.error || 'Verifique as configurações';
                    }
                }

                // Uptime
                const uptime = data.uptime;
                const days = Math.floor(uptime / 86400);
                const hours = Math.floor((uptime % 86400) / 3600);
                const minutes = Math.floor((uptime % 3600) / 60);
                const uptimeText = document.getElementById('serverUptimeText');
                if (uptimeText) uptimeText.textContent = `${days}d ${hours}h ${minutes}m`;

                // Buffer
                const bufferCard = document.getElementById('bufferHealthCard');
                const bufferText = document.getElementById('bufferCountText');
                
                if (bufferCard && bufferText) {
                    bufferText.textContent = data.bufferCount;
                    if (data.bufferCount > 0) {
                        const icon = bufferCard.querySelector('.stat-card-icon');
                        if (icon) icon.className = 'stat-card-icon color-orange';
                        bufferText.style.color = '#dd6b20';
                    } else {
                        const icon = bufferCard.querySelector('.stat-card-icon');
                        if (icon) icon.className = 'stat-card-icon color-gray';
                        bufferText.style.color = 'var(--text-primary)';
                    }
                }

                // [NOVO] Hardware do Servidor
                if (data.hardware) {
                    // CPU
                    const cpuText = document.getElementById('serverCpuText');
                    const tempText = document.getElementById('serverTempText');
                    if (cpuText) cpuText.textContent = `${data.hardware.cpu}%`;
                    if (tempText) tempText.textContent = (data.hardware.temp && data.hardware.temp !== 'N/A') ? `Temp: ${data.hardware.temp}°C` : 'Temp: N/A';

                    // Memória
                    const memUsedGB = (data.hardware.memory.used / 1073741824).toFixed(1);
                    const memTotalGB = (data.hardware.memory.total / 1073741824).toFixed(1);
                    const memText = document.getElementById('serverMemText');
                    const memDetails = document.getElementById('serverMemDetails');
                    if (memText) memText.textContent = `${data.hardware.memory.percent}%`;
                    if (memDetails) memDetails.textContent = `${memUsedGB}GB / ${memTotalGB}GB`;

                    // Disco
                    if (data.hardware.disk) {
                        const diskUsedGB = (data.hardware.disk.usedBytes / 1073741824).toFixed(1);
                        const diskTotalGB = (data.hardware.disk.size / 1073741824).toFixed(1);
                        const diskText = document.getElementById('serverDiskText');
                        const diskDetails = document.getElementById('serverDiskDetails');
                        if (diskText) diskText.textContent = `${Math.round(data.hardware.disk.used)}%`;
                        if (diskDetails) diskDetails.textContent = `${diskUsedGB}GB / ${diskTotalGB}GB`;
                    }
                }

                // [NOVO] Renderiza Servidores Remotos
                const remoteContainer = document.getElementById('remoteServersContainer');
                if (remoteContainer && data.remoteServers) {
                    remoteContainer.innerHTML = ''; // Limpa conteúdo anterior
                    
                    data.remoteServers.forEach(srv => {
                        const isOnline = srv.online;
                        
                        // Formata valores se online
                        const cpuDisplay = isOnline ? `${srv.cpu}%` : '-';
                        const cpuDetails = isOnline ? `Load: ${srv.load}` : 'N/A';
                        
                        const memDisplay = isOnline ? `${srv.memory.percent}%` : '-';
                        const memDetails = isOnline ? `${(srv.memory.used / 1073741824).toFixed(1)}GB / ${(srv.memory.total / 1073741824).toFixed(1)}GB` : '-';
                        
                        const diskDisplay = isOnline ? `${srv.disk.percent}%` : '-';
                        const diskDetails = isOnline ? `${(srv.disk.used / 1073741824).toFixed(1)}GB / ${(srv.disk.total / 1073741824).toFixed(1)}GB` : '-';

                        const serverHtml = `
                            <div class="content-section" style="margin-top: 20px;">
                                <div class="section-header" style="flex-direction: row; justify-content: space-between; width: 100%; border-bottom: 1px solid #4a5568; padding-bottom: 10px; margin-bottom: 15px;">
                                    <h4 style="margin:0; color: #e2e8f0;">${srv.name} <span style="font-size:0.8em; color:#a0aec0; font-weight:normal;">(${srv.ip})</span></h4>
                                    <span class="badge" style="background-color:${isOnline ? '#38a169' : '#e53e3e'}; color:white;">${isOnline ? 'Online' : 'Offline'}</span>
                                </div>
                                ${isOnline ? `
                                <div class="stats-grid" style="width: 100%;">
                                    <div class="stat-card">
                                        <div class="stat-card-icon color-orange"><i class="fas fa-microchip"></i></div>
                                        <div class="stat-card-info">
                                            <div class="stat-card-title">CPU</div>
                                            <div class="stat-card-value">${cpuDisplay}</div>
                                            <div class="stat-card-details">${cpuDetails}</div>
                                        </div>
                                    </div>
                                    <div class="stat-card">
                                        <div class="stat-card-icon color-purple"><i class="fas fa-memory"></i></div>
                                        <div class="stat-card-info">
                                            <div class="stat-card-title">Memória</div>
                                            <div class="stat-card-value">${memDisplay}</div>
                                            <div class="stat-card-details">${memDetails}</div>
                                        </div>
                                    </div>
                                    <div class="stat-card">
                                        <div class="stat-card-icon color-teal"><i class="fas fa-hdd"></i></div>
                                        <div class="stat-card-info">
                                            <div class="stat-card-title">Disco</div>
                                            <div class="stat-card-value">${diskDisplay}</div>
                                            <div class="stat-card-details">${diskDetails}</div>
                                        </div>
                                    </div>
                                </div>
                                ` : `<div style="text-align:center; padding: 10px; color: #fc8181; display: flex; align-items: center; justify-content: center; gap: 8px;"><i class="fas fa-info-circle"></i> ${srv.error || 'Não foi possível conectar via SSH.'}</div>`}
                            </div>
                        `;
                        remoteContainer.insertAdjacentHTML('beforeend', serverHtml);
                    });
                }

                // Recent Errors
                const tbody = document.querySelector('#recentErrorsTable tbody');
                if (tbody) {
                    tbody.innerHTML = '';
                    if (data.recentErrors.length === 0) {
                        tbody.innerHTML = '<tr><td colspan="2" style="text-align: center;">Nenhum erro recente.</td></tr>';
                    } else {
                        data.recentErrors.forEach(err => {
                            const row = document.createElement('tr');
                            row.innerHTML = `
                                <td>${new Date(err.timestamp).toLocaleString()}</td>
                                <td style="color: #fc8181;">${err.error_message}</td>
                            `;
                            tbody.appendChild(row);
                        });
                    }
                }

            } catch (error) {
                console.error("Erro ao carregar saúde do sistema:", error);
                showNotification("Erro ao carregar dados de saúde.", "error");
            } finally {
                if (showLoader && window.hidePagePreloader) {
                    window.hidePagePreloader();
                }
                // Restaura o botão
                if (checkRemote && checkBtn) {
                    checkBtn.disabled = false;
                    checkBtn.innerHTML = '<i class="fas fa-network-wired"></i> Verificar Conexão';
                }
            }
        };

        // Listener para o botão de verificação manual
        const checkRemoteBtn = document.getElementById('checkRemoteServersBtn');
        if (checkRemoteBtn) {
            checkRemoteBtn.addEventListener('click', () => loadHealthData(false, true));
        }

        loadHealthData(true);
        // Auto-refresh a cada 30 segundos
        const interval = setInterval(() => loadHealthData(false), 30000);
        
        // Função de limpeza para parar o intervalo ao sair da página
        window.cleanupSystemHealthPage = () => {
            clearInterval(interval);
        };
    };
}