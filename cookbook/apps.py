from django.apps import AppConfig
from django.conf import settings
from django.db.models.signals import post_save, post_delete


class CookbookConfig(AppConfig):
    name = 'cookbook'

    def ready(self):
        import cookbook.signals  # noqa

        if not settings.DISABLE_EXTERNAL_CONNECTORS:
            from cookbook.connectors.connector_manager import ConnectorManager  # Needs to be here to prevent loading race condition of oauth2 modules in models.py
            handler = ConnectorManager()
            post_save.connect(handler, dispatch_uid="post_save-connector_manager")
            post_delete.connect(handler, dispatch_uid="post_delete-connector_manager")
