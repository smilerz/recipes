"""
AutoOneToOneField, adapted from django-annoying (https://github.com/skorokithakis/django-annoying).

Only this one field is vendored, and trimmed to the Django versions this project supports. The package
itself is no longer a dependency, but migrations and models reference this class.

Copyright (c) Stavros Korokithakis and contributors. All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided
that the following conditions are met:

    * Redistributions of source code must retain the above copyright notice, this list of conditions and
      the following disclaimer.
    * Redistributions in binary form must reproduce the above copyright notice, this list of conditions
      and the following disclaimer in the documentation and/or other materials provided with the
      distribution.
    * Neither the name of the author nor the names of its contributors may be used to endorse or promote
      products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED
WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A
PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR ANY
DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
POSSIBILITY OF SUCH DAMAGE.
"""
from django.db.models import OneToOneField
from django.db.models.fields.related_descriptors import ReverseOneToOneDescriptor
from django.db.transaction import atomic


class AutoSingleRelatedObjectDescriptor(ReverseOneToOneDescriptor):
    """The descriptor that creates the related object when an AutoOneToOneField's reverse side is read."""

    def __get__(self, instance, instance_type=None):
        model = self.related.related_model

        try:
            return super().__get__(instance, instance_type)
        except model.DoesNotExist:
            with atomic():
                # get_or_create rather than save()/create(): it handles a concurrent creation better
                obj, _ = model.objects.get_or_create(**{self.related.field.name: instance})

            # Fill Django's cache on both sides, otherwise the first two reads return different in-memory objects
            self.related.set_cached_value(instance, obj)
            self.related.field.set_cached_value(obj, instance)
            return obj


class AutoOneToOneField(OneToOneField):
    """
    A OneToOneField whose related object is created on first access if it does not exist yet.

        class MyProfile(models.Model):
            user = AutoOneToOneField(User, primary_key=True, on_delete=models.CASCADE)
    """

    def contribute_to_related_class(self, cls, related):
        setattr(cls, related.get_accessor_name(), AutoSingleRelatedObjectDescriptor(related))
