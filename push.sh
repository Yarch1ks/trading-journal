#!/bin/bash
set -e

# Определить текущую ветку
branch=$(git rev-parse --abbrev-ref HEAD)

# Добавить все изменения
git add .

# Сделать коммит с сообщением (можно изменить)
git commit -m "Автоматический пуш: обновление кода" || echo "Нет изменений для коммита"

# Показать статус
git status

# Пушить в origin/$branch
git push origin "$branch"
