from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, Integer, String, Text, create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

from .config import settings

_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, pool_pre_ping=True, connect_args=_args)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    status: Mapped[str] = mapped_column(String(16), default="queued", index=True)  # queued|running|done|failed
    reference_name: Mapped[str] = mapped_column(String(255))
    candidate_name: Mapped[str] = mapped_column(String(255))
    options: Mapped[dict] = mapped_column(JSON, default=dict)
    result: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    batch_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)


class Reference(Base):
    """A saved "golden" reference PDF that can be reused for many validations."""

    __tablename__ = "reference_pdfs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    size: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


def init_db() -> None:
    Base.metadata.create_all(engine)  # use Alembic migrations for production schema changes
    # minimal in-place upgrade for databases created before batch support
    if "batch_id" not in {c["name"] for c in inspect(engine).get_columns("jobs")}:
        with engine.begin() as con:
            con.execute(text("ALTER TABLE jobs ADD COLUMN batch_id VARCHAR(36)"))
