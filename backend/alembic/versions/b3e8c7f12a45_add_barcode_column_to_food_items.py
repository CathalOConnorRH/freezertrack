"""add barcode column to food_items

Revision ID: b3e8c7f12a45
Revises: a7f65f4de5b9
Create Date: 2026-03-16 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b3e8c7f12a45'
down_revision: Union[str, None] = 'a7f65f4de5b9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('food_items', sa.Column('barcode', sa.String(), nullable=True))
    op.create_index(op.f('ix_food_items_barcode'), 'food_items', ['barcode'])


def downgrade() -> None:
    op.drop_index(op.f('ix_food_items_barcode'), table_name='food_items')
    op.drop_column('food_items', 'barcode')
