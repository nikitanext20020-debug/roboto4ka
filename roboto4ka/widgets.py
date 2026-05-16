"""Переиспользуемые виджеты: оверлей загрузки со спиннером."""

from PySide6.QtCore import Qt, QTimer, QSize, QRectF
from PySide6.QtGui import QPainter, QColor, QPen, QFont
from PySide6.QtWidgets import QWidget, QFrame, QVBoxLayout, QLabel, QHBoxLayout

from .theme import ACCENT, MUTED


class Spinner(QWidget):
    """Простой круговой спиннер без зависимостей."""
    def __init__(self, parent=None, size=44):
        super().__init__(parent)
        self.setFixedSize(size, size)
        self._angle = 0
        self._timer = QTimer(self)
        self._timer.timeout.connect(self._tick)

    def start(self):
        if not self._timer.isActive():
            self._timer.start(28)

    def stop(self):
        self._timer.stop()

    def _tick(self):
        self._angle = (self._angle + 12) % 360
        self.update()

    def paintEvent(self, _):
        p = QPainter(self)
        p.setRenderHint(QPainter.Antialiasing)
        rect = QRectF(4, 4, self.width() - 8, self.height() - 8)
        # фоновое кольцо
        pen = QPen(QColor("#2A2F3D"))
        pen.setWidth(4)
        p.setPen(pen)
        p.drawEllipse(rect)
        # активная дуга
        pen = QPen(QColor(ACCENT))
        pen.setWidth(4)
        pen.setCapStyle(Qt.RoundCap)
        p.setPen(pen)
        p.drawArc(rect, -self._angle * 16, 100 * 16)


class LoadingOverlay(QFrame):
    """Полупрозрачный оверлей с карточкой и спиннером."""
    def __init__(self, parent):
        super().__init__(parent)
        self.setObjectName("loadingOverlay")
        self.setAttribute(Qt.WA_StyledBackground, True)

        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        outer.addStretch(1)
        h = QHBoxLayout()
        h.addStretch(1)

        card = QFrame()
        card.setObjectName("spinnerCard")
        card.setFixedSize(280, 140)
        cv = QVBoxLayout(card)
        cv.setContentsMargins(20, 20, 20, 20)
        cv.setSpacing(10)
        cv.setAlignment(Qt.AlignCenter)

        sp_row = QHBoxLayout()
        sp_row.addStretch(1)
        self.spinner = Spinner(card, size=44)
        sp_row.addWidget(self.spinner)
        sp_row.addStretch(1)
        cv.addLayout(sp_row)

        self.label = QLabel("Загрузка...")
        self.label.setObjectName("loadingText")
        self.label.setAlignment(Qt.AlignCenter)
        cv.addWidget(self.label)

        h.addWidget(card)
        h.addStretch(1)
        outer.addLayout(h)
        outer.addStretch(1)

        self.hide()

    def show_msg(self, msg="Загрузка..."):
        self.label.setText(msg)
        if self.parent():
            self.setGeometry(self.parent().rect())
        self.spinner.start()
        self.raise_()
        self.show()

    def hide_overlay(self):
        self.spinner.stop()
        self.hide()

    def resize_to_parent(self):
        if self.parent():
            self.setGeometry(self.parent().rect())
