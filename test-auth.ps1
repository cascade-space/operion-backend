# PowerShell script to test authentication
Write-Host "Testing authentication endpoints..." -ForegroundColor Green

# Test health endpoint
Write-Host "`n1. Testing health endpoint..." -ForegroundColor Yellow
try {
    $healthResponse = Invoke-WebRequest -Uri "http://localhost:3000/health" -Method GET
    Write-Host "Health status: $($healthResponse.StatusCode)" -ForegroundColor Green
    $healthData = $healthResponse.Content | ConvertFrom-Json
    Write-Host "Health response: $($healthData.message)" -ForegroundColor Green
} catch {
    Write-Host "Health check failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test login endpoint
Write-Host "`n2. Testing login endpoint..." -ForegroundColor Yellow
try {
    $loginBody = @{
        userId = "supervisor001"
        password = "supervisor123"
        deviceId = "TEST_DEVICE"
    } | ConvertTo-Json

    $loginResponse = Invoke-WebRequest -Uri "http://localhost:3000/api/auth/login" -Method POST -Body $loginBody -ContentType "application/json"
    Write-Host "Login status: $($loginResponse.StatusCode)" -ForegroundColor Green
    
    $loginData = $loginResponse.Content | ConvertFrom-Json
    Write-Host "Login successful - User role: $($loginData.data.user.role)" -ForegroundColor Green
    
    # Test employees endpoint with token
    Write-Host "`n3. Testing employees endpoint..." -ForegroundColor Yellow
    $headers = @{
        "Authorization" = "Bearer $($loginData.data.accessToken)"
    }
    
    try {
        $employeesResponse = Invoke-WebRequest -Uri "http://localhost:3000/api/users/employees/list" -Method GET -Headers $headers
        Write-Host "Employees status: $($employeesResponse.StatusCode)" -ForegroundColor Green
        
        $employeesData = $employeesResponse.Content | ConvertFrom-Json
        Write-Host "Employees count: $($employeesData.data.Count)" -ForegroundColor Green
    } catch {
        Write-Host "Employees API failed: $($_.Exception.Message)" -ForegroundColor Red
        if ($_.Exception.Response) {
            $errorResponse = $_.Exception.Response.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($errorResponse)
            $errorContent = $reader.ReadToEnd()
            Write-Host "Error details: $errorContent" -ForegroundColor Red
        }
    }
    
} catch {
    Write-Host "Login/API test failed: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $errorResponse = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($errorResponse)
        $errorContent = $reader.ReadToEnd()
        Write-Host "Error details: $errorContent" -ForegroundColor Red
    }
}

Write-Host "`nTest completed." -ForegroundColor Green
