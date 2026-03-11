"""
Stats endpoint — summary counts grouped by a field.

Returns aggregate counts so researchers can get a quick overview of the data
without downloading everything.

ENDPOINT:
    GET /v1/stats?by=me_type        → count of insertions per TE family
    GET /v1/stats?by=chrom          → count per chromosome
    GET /v1/stats?by=variant_class  → count per variant class
    GET /v1/stats?by=annotation     → count per annotation type
    GET /v1/stats?by=me_category    → count per ME category

HOW IT WORKS:
    Uses SQL GROUP BY — the database does the counting, not Python.
    This is fast even on large datasets because the DB is optimized for aggregations.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Insertion
from app.schemas import StatEntry, StatsResponse

router = APIRouter(prefix="/v1", tags=["stats"])

# Which fields can be grouped by — maps query param values to ORM columns.
# This prevents arbitrary column access (security) and gives clear error messages.
ALLOWED_GROUP_BY = {
    "me_type": Insertion.me_type,
    "me_subtype": Insertion.me_subtype,
    "me_category": Insertion.me_category,
    "chrom": Insertion.chrom,
    "variant_class": Insertion.variant_class,
    "annotation": Insertion.annotation,
    "dataset_id": Insertion.dataset_id,
}


@router.get("/stats", response_model=StatsResponse)
def get_stats(
    by: str = Query(default="me_type", description="Field to group by"),
    db: Session = Depends(get_db),
):
    """Get summary counts grouped by a field.

    Examples:
        /v1/stats?by=me_type         → {"entries": [{"label": "ALU", "count": 33709}, ...]}
        /v1/stats?by=variant_class   → {"entries": [{"label": "Common", "count": 12287}, ...]}
    """
    if by not in ALLOWED_GROUP_BY:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid group_by field: '{by}'. Allowed: {list(ALLOWED_GROUP_BY.keys())}",
        )

    column = ALLOWED_GROUP_BY[by]

    rows = (
        db.query(column, func.count().label("count"))
        .group_by(column)
        .order_by(func.count().desc())
        .all()
    )

    entries = [StatEntry(label=str(label) if label else "(null)", count=count) for label, count in rows]

    return StatsResponse(group_by=by, entries=entries)
