$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
function Para([string]$s) { '<w:p><w:r><w:t xml:space="preserve">' + [System.Security.SecurityElement]::Escape($s) + '</w:t></w:r></w:p>' }
$body = Para 'BETA — REAL-USER VALIDATION RECORD'
$body += Para 'DRAFT TEMPLATE — NOT COMPLETED VALIDATION EVIDENCE'
$body += Para 'This document provides 53 blank participant slots. It does not assert that 53 people used Beta. Complete only from actual sessions and remove unused rows before submission.'
$body += Para 'Project: Beta | Proposed challenge: Voice-First Access'
$body += Para 'App version / URL: [complete]'
$body += Para 'Testing dates and timezone: [complete]'
$body += Para 'Actual participants: [complete] | Actual documented interactions: [complete]'
$body += Para 'METHOD'
$body += Para 'Describe how participants were recruited, their relevance to Nigerian trading, the languages used, consent for anonymised reporting, devices, assistance and test tasks. State whether transactions used test inventory.'
$body += Para 'Count participants separately from interactions. One participant may complete several tasks. Record failures and corrections; do not count separate API calls as separate user tasks.'
$body += Para 'PARTICIPANT REGISTER — COMPLETE FROM ACTUAL SESSIONS'
$body += '<w:tbl><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders></w:tblPr>'
$headers = @('Anonymous ID','Session date / consent','Language / trader context','Interaction IDs / evidence')
$body += '<w:tr>'
foreach ($h in $headers) { $body += '<w:tc>' + (Para $h) + '</w:tc>' }
$body += '</w:tr>'
for ($i=1; $i -le 53; $i++) {
 $body += '<w:tr>'
 foreach ($v in @(('P{0:D2}' -f $i),'[not recorded]','[not recorded]','[not recorded]')) { $body += '<w:tc>' + (Para $v) + '</w:tc>' }
 $body += '</w:tr>'
}
$body += '</w:tbl>'
$body += Para 'INTERACTION EVIDENCE'
$body += Para 'Attach the completed interaction-log.csv. For each task include timestamp, anonymous participant ID, expected sale details, actual transcript and extraction, outcome, corrections, database references where available, and screenshot or session-note references. Record unsuccessful attempts even when no database entry exists.'
$body += Para 'RESULTS — FILL ONLY AFTER TESTING'
$body += Para 'Actual interactions: [ ] | Correct without correction: [ ] | Completed after correction: [ ] | Failed: [ ]'
$body += Para 'Observed feedback and common errors: [complete from notes]'
$body += Para 'Limitations and untested languages/workflows: [complete]'
$body += Para 'SUPPORTING ARTEFACTS'
$body += Para 'List actual anonymised session notes, screenshots, database extracts and redacted service logs. Integration evidence should separately establish calls to the official ASR and N-ATLaS models. Do not include credentials.'
$body += Para 'ACCURACY DECLARATION — SIGN ONLY WHEN COMPLETE'
$body += Para 'I confirm that the completed entries describe sessions that actually occurred and that reported counts are supported by the attached records.'
$body += Para 'Prepared by: [ ] | Role: [ ] | Date: [ ] | Signature: [ ]'
$entries = @{
 '[Content_Types].xml' = '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
 '_rels/.rels' = '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
 'word/document.xml' = '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + $body + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1000" w:right="900" w:bottom="1000" w:left="900"/></w:sectPr></w:body></w:document>'
}
$dest = Join-Path $PSScriptRoot 'Beta-validation-53-participant-template.docx'
$zip = [System.IO.Compression.ZipFile]::Open($dest, [System.IO.Compression.ZipArchiveMode]::Create)
try {
 foreach ($name in $entries.Keys) {
  [xml]$checked = $entries[$name]
  $entry = $zip.CreateEntry($name)
  $writer = [System.IO.StreamWriter]::new($entry.Open(), [System.Text.UTF8Encoding]::new($false))
  try { $writer.Write($entries[$name]) } finally { $writer.Dispose() }
 }
} finally { $zip.Dispose() }
Write-Output "Created: $dest"
