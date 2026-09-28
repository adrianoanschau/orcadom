FROM postgres:16-alpine

RUN apk add --no-cache \
      age \
      aws-cli \
      bash \
      curl \
      python3 \
      tzdata

ENV TZ=America/Sao_Paulo

WORKDIR /backup
COPY gfs.py metrics.py metrics_server.py dbutil.py sentry_event.py /backup/
COPY lib.sh backup.sh restore.sh restore-test.sh entrypoint.sh /backup/
RUN chmod +x /backup/*.sh \
    && mkdir -p /keys /var/lib/backup-metrics \
    && chown -R postgres:postgres /keys /var/lib/backup-metrics

ENV BACKUP_METRICS_PORT=9105
EXPOSE 9105
ENTRYPOINT ["/backup/entrypoint.sh"]
