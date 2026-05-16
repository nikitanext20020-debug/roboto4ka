"""
Roboto4ka — Create by Nikita
Специально для офисных планктонов.

Запуск:  python Roboto4ka.py
Сборка:  pyinstaller --onefile --noconsole --name "Roboto4ka" --add-data "config.json;." Roboto4ka.py
"""

from roboto4ka.app import main

if __name__ == "__main__":
    main()
