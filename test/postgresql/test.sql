drop table lula_sync_stream
;

drop table lula_sync_stream_test
;

create table lula_sync_stream (
  lula_sync_stream_id serial primary key,
  lula_sync_key varchar(32) unique not null,
  redis_stream_key varchar(64) unique not null,
  redis_host_key varchar(128) unique not null,
  last_id varchar(32),
  _enabled boolean default false,
  _updated timestamp not null default now()
)
;

create table lula_sync_stream_test (
  _id varchar(16) unique not null,
  _data text,
  _ref varchar(16),
  _spec varchar(32),
  _type varchar(64),
  _source varchar(64),
  _subject varchar(64),
  _time timestamptz
)
;

insert into lula_sync_stream (
  lula_sync_key,
  redis_host_key,
  redis_stream_key
) values (
  'test',
  'localhost',
  'lula-sync:test:x'
)
;

update lula_sync_stream
set redis_host_key = 'localhost',
_enabled = true
;

select * from lula_sync_stream
;

select * from lula_sync_stream
where redis_host_key = 'localhost'
and _enabled = true
;

;
