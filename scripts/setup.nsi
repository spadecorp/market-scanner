Unicode true
Target amd64-unicode
RequestExecutionLevel user
Name "Market Scanner"
OutFile "${OUTPUT}"
InstallDir "$LOCALAPPDATA\Programs\SPaDe Corp\Market Scanner"
!define MUI_ICON "${ICON}"
!define MUI_UNICON "${ICON}"
VIProductVersion "${VERSION}.0"
VIAddVersionKey /LANG=1033 "ProductName" "Market Scanner"
VIAddVersionKey /LANG=1033 "CompanyName" "SPaDe Corp"
VIAddVersionKey /LANG=1033 "FileDescription" "Market Scanner Setup"
VIAddVersionKey /LANG=1033 "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=1033 "LegalCopyright" "SPaDe Corp"
SetCompressor zlib
!include MUI2.nsh
!define MUI_FINISHPAGE_RUN "$INSTDIR\Market Scanner.exe"
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Section "Market Scanner"
  SetOutPath "$INSTDIR"
  File /r "${PAYLOAD}\*"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateShortcut "$SMPROGRAMS\Market Scanner.lnk" "$INSTDIR\Market Scanner.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\SPaDeMarketScanner" "DisplayName" "Market Scanner"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\SPaDeMarketScanner" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\SPaDeMarketScanner" "UninstallString" '"$INSTDIR\Uninstall.exe"'
SectionEnd

Section "Uninstall"
  !include "${REMOVE_FILES}"
  Delete "$SMPROGRAMS\Market Scanner.lnk"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\SPaDeMarketScanner"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
SectionEnd
