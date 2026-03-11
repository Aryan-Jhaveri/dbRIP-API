"""
Datasets endpoint — shows what datasets are loaded in the database.

This is useful for verifying that data was ingested correctly and checking
when it was last updated.

ENDPOINTS:
    GET /v1/datasets          → list all loaded datasets
    GET /v1/datasets/{id}     → single dataset details
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import DatasetRegistry
from app.schemas import DatasetOut

router = APIRouter(prefix="/v1", tags=["datasets"])


@router.get("/datasets", response_model=list[DatasetOut])
def list_datasets(db: Session = Depends(get_db)):
    """List all loaded datasets with row counts and load timestamps.

    Example response:
        [{"id": "dbrip_v1", "version": "1.0", "row_count": 44984, ...}]
    """
    return db.query(DatasetRegistry).all()


@router.get("/datasets/{dataset_id}", response_model=DatasetOut)
def get_dataset(dataset_id: str, db: Session = Depends(get_db)):
    """Get details for a single dataset.

    Example:
        /v1/datasets/dbrip_v1
    """
    dataset = db.query(DatasetRegistry).filter_by(id=dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail=f"Dataset {dataset_id} not found")
    return dataset
