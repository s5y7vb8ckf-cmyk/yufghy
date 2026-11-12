MILO POS Receipt V2 - 2026-11-07

Changes: branch from invoice_header settings, refund policy and extra footer in native bridge, configurable logo/QR sizes, boxed order number, payment/cash/card/change moved to totals, tax inclusive label. Separate kitchen receipts retained. Reduced bridge per-print artificial delay from 450 to 90 ms.

IMPORTANT: cashier still waits for confirmed server invoice before printing, to avoid unconfirmed fiscal receipts. Network validation and database confirmation may remain the main cause of checkout delay. No verified hardware tests. Back up your current files; deploy cashier + bridge together.

Build on Windows: cd MILO_Print_Bridge && dotnet publish MILO.PrintBridge.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o dist
