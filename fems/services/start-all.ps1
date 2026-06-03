# TZW LTD FEMS - Start All Microservices
# Run this script from the /services directory: .\start-all.ps1

Write-Host "Starting TZW LTD FEMS Microservices..." -ForegroundColor Red

$services = @(
  @{ name = "User Service";         dir = "user-service";         port = 3001 },
  @{ name = "Extinguisher Service"; dir = "extinguisher-service"; port = 3002 },
  @{ name = "Inspection Service";   dir = "inspection-service";   port = 3003 },
  @{ name = "Report Service";       dir = "report-service";       port = 3004 },
  @{ name = "API Gateway";          dir = "api-gateway";          port = 3000 }
)

foreach ($svc in $services) {
  Write-Host "  Starting $($svc.name) on port $($svc.port)..." -ForegroundColor Yellow
  Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\$($svc.dir)'; npm start" -WindowStyle Normal
  Start-Sleep -Milliseconds 1500
}

Write-Host ""
Write-Host "All services started!" -ForegroundColor Green
Write-Host ""
Write-Host "Service URLs:" -ForegroundColor Cyan
Write-Host "  API Gateway:          http://localhost:3000"
Write-Host "  API Gateway Docs:     http://localhost:3000/api-docs"
Write-Host "  Health Check:         http://localhost:3000/health"
Write-Host "  User Service Docs:    http://localhost:3001/api-docs"
Write-Host "  Extinguisher Docs:    http://localhost:3002/api-docs"
Write-Host "  Inspection Docs:      http://localhost:3003/api-docs"
Write-Host "  Report Service Docs:  http://localhost:3004/api-docs"
