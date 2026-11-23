param([string]$MongoExecutable='')
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
$previewData=Join-Path $projectRoot 'outputs\content-preview-mongodb'
New-Item -ItemType Directory -Force -Path $previewData | Out-Null
if (-not $MongoExecutable) {
  $mongoCommand=Get-Command mongod -ErrorAction SilentlyContinue
  if ($mongoCommand) { $MongoExecutable=$mongoCommand.Source }
  else { $MongoExecutable=Join-Path $projectRoot '.local-backups\mongodb-native-tests\mongod.exe' }
}
if (-not (Test-Path -LiteralPath $MongoExecutable)) { throw 'Install MongoDB Community Server or pass -MongoExecutable with your mongod.exe path.' }
if (Get-NetTCPConnection -State Listen -LocalPort 37029 -ErrorAction SilentlyContinue) {
  Write-Output 'Port 37029 is already listening. Run initialize-content-preview-db.mjs to validate the replica set.'
  exit 0
}
$mongoArguments=@('--dbpath',('"'+$previewData+'"'),'--logpath',('"'+(Join-Path $previewData 'mongod.log')+'"'),'--logappend','--replSet','ppcPreview','--bind_ip','127.0.0.1','--port','37029','--wiredTigerCacheSizeGB','0.25')
$previewProcess=Start-Process -FilePath $MongoExecutable -ArgumentList $mongoArguments -WindowStyle Hidden -PassThru
Write-Output ('Local preview MongoDB started. PID: '+$previewProcess.Id)
