"""
SkyTrace v2.0 Sprint 4 — SSE 实时推送服务
使用 Server-Sent Events 推送航班状态变更
"""
import json
import time
import queue
import threading
from datetime import datetime


class SSEBroker:
    """
    简易 SSE 消息代理
    - 每个用户一个队列
    - 航班状态变更时 publish
    - 前端 EventSource 连接 consume
    """

    def __init__(self):
        self._queues: dict[int, queue.Queue] = {}
        self._lock = threading.Lock()

    def subscribe(self, user_id: int) -> queue.Queue:
        """为用户创建消息队列"""
        with self._lock:
            if user_id not in self._queues:
                self._queues[user_id] = queue.Queue(maxsize=100)
            return self._queues[user_id]

    def unsubscribe(self, user_id: int):
        """清理用户队列"""
        with self._lock:
            self._queues.pop(user_id, None)

    def publish(self, user_id: int, event_type: str, data: dict):
        """推送事件到用户队列"""
        with self._lock:
            q = self._queues.get(user_id)
            if q:
                try:
                    q.put_nowait({
                        'event': event_type,
                        'data': json.dumps(data, ensure_ascii=False),
                        'timestamp': datetime.utcnow().isoformat() + 'Z',
                    })
                except queue.Full:
                    pass  # 丢弃旧事件

    def consume(self, user_id: int, timeout: float = 30.0):
        """消费事件 (阻塞等待)"""
        q = self._queues.get(user_id)
        if not q:
            return None
        try:
            return q.get(timeout=timeout)
        except queue.Empty:
            return None


# 全局单例
broker = SSEBroker()


def generate_sse_events(user_id: int):
    """
    Flask SSE 生成器 — 在路由中使用:
        return Response(generate_sse_events(user_id), mimetype='text/event-stream')
    """
    q = broker.subscribe(user_id)
    try:
        # 首条心跳
        yield f"event: connected\ndata: {json.dumps({'user_id': user_id})}\n\n"

        while True:
            msg = broker.consume(user_id, timeout=25.0)
            if msg is None:
                # 心跳保活
                yield f": heartbeat {int(time.time())}\n\n"
            else:
                yield f"event: {msg['event']}\ndata: {msg['data']}\n\n"
    except GeneratorExit:
        broker.unsubscribe(user_id)
