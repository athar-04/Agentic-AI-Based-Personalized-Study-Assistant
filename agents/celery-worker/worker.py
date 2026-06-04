from celery import Celery
import os

BROKER_URL = os.getenv('CELERY_BROKER_URL')
RESULT_BACKEND = os.getenv('CELERY_RESULT_BACKEND')

app = Celery('celery_worker', broker=BROKER_URL, backend=RESULT_BACKEND)

# Example task
@app.task
def add(x, y):
    return x + y
