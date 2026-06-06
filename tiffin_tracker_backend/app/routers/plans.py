from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.dependencies import get_db, get_current_operator
from app.models.operator import Operator
from app.models.plan import Plan
from app.schemas.plan import PlanCreate, PlanUpdate, PlanResponse

router = APIRouter()


@router.get("", response_model=list[PlanResponse])
async def list_plans(
    db: AsyncSession = Depends(get_db),
    operator: Operator = Depends(get_current_operator),
):
    result = await db.execute(
        select(Plan)
        .where(Plan.operator_id == operator.id)
        .order_by(Plan.created_at.desc())
    )
    return result.scalars().all()


@router.post("", response_model=PlanResponse, status_code=201)
async def create_plan(
    data: PlanCreate,
    db: AsyncSession = Depends(get_db),
    operator: Operator = Depends(get_current_operator),
):
    plan = Plan(**data.model_dump(), operator_id=operator.id)
    db.add(plan)
    await db.commit()
    await db.refresh(plan)
    return plan


@router.get("/{plan_id}", response_model=PlanResponse)
async def get_plan(
    plan_id: int,
    db: AsyncSession = Depends(get_db),
    operator: Operator = Depends(get_current_operator),
):
    result = await db.execute(
        select(Plan).where(Plan.id == plan_id, Plan.operator_id == operator.id)
    )
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    return plan


@router.put("/{plan_id}", response_model=PlanResponse)
async def update_plan(
    plan_id: int,
    data: PlanUpdate,
    db: AsyncSession = Depends(get_db),
    operator: Operator = Depends(get_current_operator),
):
    result = await db.execute(
        select(Plan).where(Plan.id == plan_id, Plan.operator_id == operator.id)
    )
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(plan, field, value)

    await db.commit()
    await db.refresh(plan)
    return plan


@router.delete("/{plan_id}", status_code=204)
async def deactivate_plan(
    plan_id: int,
    db: AsyncSession = Depends(get_db),
    operator: Operator = Depends(get_current_operator),
):
    result = await db.execute(
        select(Plan).where(Plan.id == plan_id, Plan.operator_id == operator.id)
    )
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    plan.is_active = False
    await db.commit()
