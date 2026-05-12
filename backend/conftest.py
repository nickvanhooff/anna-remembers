"""Pytest configuration for backend tests."""
import sys
from pathlib import Path

# Add backend root to Python path so imports work correctly
sys.path.insert(0, str(Path(__file__).parent))
