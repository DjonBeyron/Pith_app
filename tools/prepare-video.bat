@echo off
rem Drag & drop a video file onto this bat. Logic lives in prepare-video.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0prepare-video.ps1" %*
pause
