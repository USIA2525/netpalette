import { AppNode, AppEdge } from '../types';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';

export const exportToTerraform = async (nodes: AppNode[], edges: AppEdge[]) => {
  void edges;
  let tf = `# ==========================================\n`;
  tf += `# 自動生成された Terraform コード (NetPalette)\n`;
  tf += `# ==========================================\n\n`;
  tf += `provider "aws" {\n  region = "ap-northeast-1"\n}\n\n`;

  const vpcs = nodes.filter(n => n.type === 'subnet' || n.data.deviceType === 'AWS VPC');
  vpcs.forEach((vpc, i) => {
    tf += `resource "aws_vpc" "netpalette_vpc_${i}" {\n  cidr_block = "${vpc.data.cidr || '10.0.0.0/16'}"\n  tags = {\n    Name = "${vpc.data.label}"\n  }\n}\n\n`;
  });

  const ec2s = nodes.filter(n => n.data.deviceType === 'AWS EC2' || n.data.deviceType === 'サーバー');
  ec2s.forEach((ec2, i) => {
    tf += `resource "aws_instance" "netpalette_ec2_${i}" {\n  ami           = "ami-0c3fd0f5d33134a76" # Amazon Linux 2\n  instance_type = "t3.micro"\n  private_ip    = "${ec2.data.ip}"\n  tags = {\n    Name = "${ec2.data.label}"\n  }\n}\n\n`;
  });

  const rds = nodes.filter(n => n.data.deviceType === 'AWS RDS' || n.data.deviceType === 'DB');
  rds.forEach((db, i) => {
    tf += `resource "aws_db_instance" "netpalette_rds_${i}" {\n  allocated_storage = 20\n  engine            = "mysql"\n  instance_class    = "db.t3.micro"\n  tags = {\n    Name = "${db.data.label}"\n  }\n}\n\n`;
  });

  try {
    // 🌟 修正: Tauriのネイティブ保存ダイアログを開く
    const filePath = await save({
      title: 'Terraform コードを保存',
      defaultPath: 'main.tf',
      filters: [{ name: 'Terraform', extensions: ['tf'] }]
    });

    // ユーザーが保存先を選んだ場合のみファイルに書き込む
    if (filePath) {
      await writeTextFile(filePath, tf);
      alert('✅ Terraformファイル (.tf) を保存しました！');
    }
  } catch (error) {
    console.error('保存エラー:', error);
    // 念のため、Tauri APIが失敗した場合のフォールバック（ブラウザ標準ダウンロード）
    const blob = new Blob([tf], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `main.tf`;
    link.click();
    URL.revokeObjectURL(url);
  }
};