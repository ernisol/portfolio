"""Nox configuration file"""

import nox

nox.options.default_venv_backend = "uv"



@nox.session
def lint(session):
    session.run("ruff", "check", ".", "--fix")
    session.run("ruff", "check", ".")


@nox.session
def typecheck(session):
    session.run("mypy", ".")
