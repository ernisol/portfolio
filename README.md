## Useful commands

Run server:
```sh
uv run python manage.py runserver 8080
```

Create a new app:
```sh
uv run python manage.py startapp projects
```

DB:
```sh
uv run python manage.py makemigrations
uv run python manage.py migrate
```

Admin:
```sh
uv run python manage.py createsuperuser
```

Lint / typecheck / test
```sh
nox
```