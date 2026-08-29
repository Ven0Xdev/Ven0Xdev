"""Solana-specific access layer.

Nothing above this package may import a provider SDK, parse a provider-shaped
response, or know which vendor is in use. Everything crosses the boundary as
the normalized types in :mod:`vyraxis.scanner.events`.
"""
