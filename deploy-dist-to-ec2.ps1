# PowerShell script to deploy built dist folder to EC2

param(
    [Parameter(Mandatory=$true)]
    [string]$EC2Host,
    
    [Parameter(Mandatory=$true)]
    [string]$KeyFile
)

Write-Host "📦 Creating archive of dist folder..." -ForegroundColor Yellow
Compress-Archive -Path dist -DestinationPath dist.zip -Force

Write-Host "📤 Uploading to EC2..." -ForegroundColor Yellow
scp -i $KeyFile dist.zip ubuntu@${EC2Host}:~/operion-backend/

Write-Host "🔧 Extracting and restarting on EC2..." -ForegroundColor Yellow
ssh -i $KeyFile ubuntu@${EC2Host} @"
cd ~/operion-backend && \
rm -rf dist && \
unzip -q dist.zip && \
rm dist.zip && \
pm2 restart operion-backend && \
pm2 logs operion-backend --lines 20 --nostream
"@

Write-Host "✅ Deployment complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Usage: .\deploy-dist-to-ec2.ps1 -EC2Host 'your-ec2-ip' -KeyFile 'path\to\your-key.pem'"

