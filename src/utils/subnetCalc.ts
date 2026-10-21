export const calculateSubnet = (cidr: string, baseNetwork: string = '192.168.1') => {
  const prefix = parseInt(cidr.replace('/', ''), 10);
  if (isNaN(prefix) || prefix < 0 || prefix > 32) return { maxHosts: 0, subnetMask: '', ipRange: '' };
  
  const hostBits = 32 - prefix;
  const maxHosts = hostBits > 1 ? Math.pow(2, hostBits) - 2 : 0;
  
  const maskMap: Record<string, string> = {
    '/24': '255.255.255.0', '/25': '255.255.255.128', '/26': '255.255.255.192',
    '/27': '255.255.255.224', '/28': '255.255.255.240', '/29': '255.255.255.248',
  };
  const subnetMask = maskMap[cidr] || '255.255.255.x';
  
  const ipRange = maxHosts > 0 ? `${baseNetwork}.1 ～ ${baseNetwork}.${maxHosts}` : 'N/A';
  
  return { maxHosts, subnetMask, ipRange, networkAddress: `${baseNetwork}.0` };
};

export const generateSimulatorTable = (baseNetwork: string, currentCount: number) => {
  const cidrs = ['/24', '/25', '/26', '/27', '/28', '/29'];
  return cidrs.map(cidr => {
    const calc = calculateSubnet(cidr, baseNetwork);
    const overflowCount = currentCount - calc.maxHosts;
    
    // ★修正: = '' (初期値) を入れず、型宣言のみにして no-useless-assignment エラーを解消
    let statusText: string;
    let statusType: 'safe' | 'warning' | 'danger';
    
    if (overflowCount > 0) {
      statusText = `⚠️ 警告: ${overflowCount}台超過 (容量不足)`;
      statusType = 'danger';
    } else if (calc.maxHosts - currentCount <= 5) {
      statusText = '正常 (収容可能)';
      statusType = 'warning';
    } else {
      statusText = '正常 (余裕あり)';
      statusType = 'safe';
    }

    return { cidr, ...calc, statusText, statusType };
  });
};