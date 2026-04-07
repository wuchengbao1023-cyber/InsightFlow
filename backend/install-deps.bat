@echo off
echo Installing Python 3.14 compatible dependencies...

set PY=C:\Users\23365\.workbuddy\binaries\python\versions\3.14.3\python.exe

cd /d "%~dp0"

::: Upgrade pip/setuptools first
%PY% -m pip install --upgrade pip setuptools wheel

::: Install dependencies one by one to avoid conflicts
%PY% -m pip install fastapi==0.104.1
%PY% -m pip install uvicorn[standard]==0.24.0
%PY% -m pip install python-multipart==0.0.6

%PY% -m pip install numpy
%PY% -m pip install pandas
%PY% -m pip install scipy
%PY% -m pip install scikit-learn

%PY% -m pip install aiohttp==3.9.1
%PY% -m pip install python-dotenv==1.0.0

%PY% -m pip install pydantic==2.5.0
%PY% -m pip install pydantic-settings==2.1.0
%PY% -m pip install loguru==0.7.2
%PY% -m pip install colorama==0.4.6
%PY% -m pip install python-dateutil==2.8.2
%PY% -m pip install pytz==2023.3

%PY% -m pip install aiofiles==23.2.1
%PY% -m pip install pyjwt==2.8.0
%PY% -m pip install duckdb==0.8.1
%PY% -m pip install aiosqlite==0.19.0

%PY% -m pip install pytest==7.4.3
%PY% -m pip install pytest-asyncio==0.21.1

echo.
echo Installation completed!
echo.
pause
