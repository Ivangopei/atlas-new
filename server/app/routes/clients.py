from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.db import get_connection

router = APIRouter(prefix="/api/clients", tags=["clients"])


@router.get("")
def list_clients():
    query = """
        SELECT
            c.id,
            c.name,
            c.type,
            c.industry,
            c.location,
            c.status,
            ct.name  AS primary_contact,
            ct.email AS primary_email,
            ct.phone AS primary_phone,
            string_agg(DISTINCT p.program, ', ') AS programs,
            (SELECT COUNT(*)
               FROM tasks t
              WHERE t.client_id = c.id AND t.status <> 'done') AS open_tasks
        FROM clients c
        LEFT JOIN contacts ct ON ct.client_id = c.id AND ct.is_primary
        LEFT JOIN projects p  ON p.client_id = c.id
        GROUP BY c.id, ct.name, ct.email, ct.phone
        ORDER BY c.name
    """

    with get_connection() as conn:
        clients = conn.execute(query).fetchall()

    return clients


class ClientCreate(BaseModel):
    """What the Add Client form sends."""

    name: str = Field(min_length=1)
    type: Literal["business", "individual"]
    industry: str | None = None
    location: str = Field(min_length=1)
    status: Literal["active", "waiting", "onboarding"] = "onboarding"
    primary_contact: str = Field(min_length=1)  # a person's name, or an email/phone for individuals
    programs: list[Literal["h2a", "h2b", "eb3"]] = []


@router.post("", status_code=201)
def create_client(client: ClientCreate):
    # Businesses have a contact person. For individuals, the client is
    # their own contact, and the form field holds their email or phone.
    if client.type == "business":
        contact_name, email, phone = client.primary_contact, None, None
        industry = client.industry or None
    else:
        contact_name = client.name
        email = client.primary_contact if "@" in client.primary_contact else None
        phone = None if email else client.primary_contact
        industry = None

    with get_connection() as conn:
        new_id = conn.execute(
            "SELECT clients_create(%s, %s, %s, %s, %s, %s, %s, %s, %s) AS id",
            (client.name, client.type, industry, client.location, client.status,
             contact_name, email, phone, client.programs),
        ).fetchone()["id"]

    return {"id": new_id}

@router.delete("/{client_id}", status_code=204)
def delete_client(client_id: int):
    with get_connection() as conn:
        deleted = conn.execute(
            "SELECT clients_delete(%s) AS deleted", (client_id,)
        ).fetchone()["deleted"]

    if not deleted:
        raise HTTPException(status_code=404, detail="Client not found")