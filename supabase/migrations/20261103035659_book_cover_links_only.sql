-- Existing embedded covers are migrated with scripts/move-book-covers-to-pone.mjs first.
alter table public.story_books add constraint story_books_cover_link_only check(cover_url !~ '^data:');
