"""Nox configuration file"""

import nox

nox.options.default_venv_backend = "uv"


@nox.session
def black(session):
    session.run("uv", "run", "python", "-m", "black", ".")


@nox.session
def ruff(session):
    session.run("ruff", "check", ".", "--fix")
    session.run("ruff", "check", ".")


@nox.session
def typecheck(session):
    session.run("mypy", ".")
