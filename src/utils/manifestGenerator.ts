import { AppNode, AppEdge } from '../types';

export function exportToKubernetesYAML(nodes: AppNode[], _edges: AppEdge[]) {
  const devices = nodes.filter(n => n.type === 'device' && ['サーバー', 'DB', 'VM', 'コンテナ'].includes(n.data.deviceType as string));
  
  if (devices.length === 0) {
    alert('⚠️ エクスポート対象のサーバーやコンテナノードがありません。');
    return;
  }

  let yamlContent = `# ==========================================\n`;
  yamlContent += `# NetPalette Auto-Generated Kubernetes Manifests\n`;
  yamlContent += `# ==========================================\n\n`;

  devices.forEach((dev) => {
    const name = (dev.data.label || 'app').toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const ip = dev.data.ip || '192.168.1.10';
    const power = dev.data.power || 50;

    yamlContent += `apiVersion: apps/v1\n`;
    yamlContent += `kind: Deployment\n`;
    yamlContent += `metadata:\n`;
    yamlContent += `  name: ${name}\n`;
    yamlContent += `  labels:\n`;
    yamlContent += `    app: ${name}\n`;
    yamlContent += `    netpalette.device-type: "${dev.data.deviceType}"\n`;
    yamlContent += `    netpalette.power-watts: "${power}"\n`;
    yamlContent += `spec:\n`;
    yamlContent += `  replicas: 1\n`;
    yamlContent += `  selector:\n`;
    yamlContent += `    matchLabels:\n`;
    yamlContent += `      app: ${name}\n`;
    yamlContent += `  template:\n`;
    yamlContent += `    metadata:\n`;
    yamlContent += `      labels:\n`;
    yamlContent += `        app: ${name}\n`;
    yamlContent += `    spec:\n`;
    yamlContent += `      containers:\n`;
    yamlContent += `      - name: ${name}\n`;
    yamlContent += `        image: ${name}:latest\n`;
    yamlContent += `        env:\n`;
    yamlContent += `        - name: STATIC_IP\n`;
    yamlContent += `          value: "${ip}"\n`;
    yamlContent += `---\n`;
    yamlContent += `apiVersion: v1\n`;
    yamlContent += `kind: Service\n`;
    yamlContent += `metadata:\n`;
    yamlContent += `  name: ${name}-svc\n`;
    yamlContent += `spec:\n`;
    yamlContent += `  selector:\n`;
    yamlContent += `    app: ${name}\n`;
    yamlContent += `  ports:\n`;
    yamlContent += `  - port: 80\n`;
    yamlContent += `    targetPort: 8080\n`;
    yamlContent += `\n---\n\n`;
  });

  downloadFile(yamlContent, 'k8s-manifests.yaml', 'text/yaml');
}

export function exportToDockerCompose(nodes: AppNode[], _edges: AppEdge[]) {
  const devices = nodes.filter(n => n.type === 'device' && ['サーバー', 'DB', 'VM', 'コンテナ'].includes(n.data.deviceType as string));

  if (devices.length === 0) {
    alert('⚠️ エクスポート対象のサーバーやコンテナノードがありません。');
    return;
  }

  let composeContent = `version: '3.8'\n\nservices:\n`;

  devices.forEach((dev) => {
    const name = (dev.data.label || 'app').toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const ip = dev.data.ip || '192.168.1.10';

    composeContent += `  ${name}:\n`;
    composeContent += `    image: ${name}:latest\n`;
    composeContent += `    container_name: ${name}\n`;
    composeContent += `    restart: always\n`;
    composeContent += `    environment:\n`;
    composeContent += `      - STATIC_IP=${ip}\n`;
    composeContent += `    networks:\n`;
    composeContent += `      netpalette_net:\n`;
    composeContent += `        ipv4_address: ${ip}\n\n`;
  });

  composeContent += `networks:\n  netpalette_net:\n    driver: bridge\n`;

  downloadFile(composeContent, 'docker-compose.yml', 'text/yaml');
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}