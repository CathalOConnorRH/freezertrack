"""Todo list platform for FreezerTrack.

Exposes freezer items as a HA todo list. Adding a todo item creates a
new freezer entry. Marking an item as completed removes it from the
freezer (scan-out). Deleting a todo item also removes it.
"""

from __future__ import annotations

from datetime import date
from typing import TYPE_CHECKING

from homeassistant.components.todo import (
    TodoItem,
    TodoItemStatus,
    TodoListEntity,
    TodoListEntityFeature,
)

from .const import DOMAIN, LOGGER
from .entity import FreezerTrackEntity

if TYPE_CHECKING:
    from homeassistant.core import HomeAssistant
    from homeassistant.helpers.entity_platform import AddEntitiesCallback

    from .coordinator import FreezerTrackCoordinator
    from .data import FreezerTrackConfigEntry


async def async_setup_entry(
    hass: HomeAssistant,
    entry: FreezerTrackConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up the FreezerTrack todo list."""
    async_add_entities([
        FreezerTrackTodoList(coordinator=entry.runtime_data.coordinator)
    ])


class FreezerTrackTodoList(FreezerTrackEntity, TodoListEntity):
    """A todo list backed by freezer inventory items."""

    _attr_name = "Freezer contents"
    _attr_supported_features = (
        TodoListEntityFeature.CREATE_TODO_ITEM
        | TodoListEntityFeature.UPDATE_TODO_ITEM
        | TodoListEntityFeature.DELETE_TODO_ITEM
    )

    def __init__(self, coordinator: FreezerTrackCoordinator) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{coordinator.config_entry.entry_id}_todo"

    @property
    def todo_items(self) -> list[TodoItem] | None:
        if not self.coordinator.data:
            return None
        items = self.coordinator.data.get("state", {}).get("items", [])
        return [
            TodoItem(
                uid=item["id"],
                summary=item.get("name", "Unknown"),
                status=TodoItemStatus.NEEDS_ACTION,
            )
            for item in items
        ]

    async def async_create_todo_item(self, item: TodoItem) -> None:
        """Add a new item to the freezer."""
        client = self.coordinator.config_entry.runtime_data.client
        try:
            await client.async_create_item(name=item.summary or "Unknown")
            await self.coordinator.async_request_refresh()
        except Exception:
            LOGGER.exception("Failed to add item to freezer")
            raise

    async def async_update_todo_item(self, item: TodoItem) -> None:
        """Mark an item as completed = remove from freezer."""
        if item.status == TodoItemStatus.COMPLETED and item.uid:
            client = self.coordinator.config_entry.runtime_data.client
            try:
                await client.async_remove_item(item.uid)
                await self.coordinator.async_request_refresh()
            except Exception:
                LOGGER.exception("Failed to remove item from freezer")
                raise

    async def async_delete_todo_items(self, uids: list[str]) -> None:
        """Delete items from the freezer."""
        client = self.coordinator.config_entry.runtime_data.client
        for uid in uids:
            try:
                await client.async_remove_item(uid)
            except Exception:
                LOGGER.exception("Failed to remove item %s", uid)
        await self.coordinator.async_request_refresh()
