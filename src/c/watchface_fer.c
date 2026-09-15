#include <pebble.h>

// Watchface para Pebble Time 2 (emery, 200x228). Diseño inspirado en
// "Typical Outdoor" de rukari/@hidea; código propio.
//
//  ┌──────────────────────────────┐
//  │  14/SEP      ┌────────────┐  │  zona superior: fecha + glucosa
//  │    LUN       │ G  120  →  │  │  (LibreLinkUp, vía teléfono)
//  │              └────────────┘  │
//  │           17:29              │  zona central: hora
//  │  ┌──────┐     ▲  9:30        │  zona inferior: batería + eventos
//  │  └──────┘     ▼ 11:00        │  (▲ anterior, ▼ próximo, como el Timeline)
//  │    87%                       │
//  └──────────────────────────────┘

// Skin "Blueberry": textos, marcos e íconos en azul sobre negro. Los colores con
// significado (glucosa según rango, nivel de batería) no dependen del skin.
#define SKIN_BACKGROUND GColorBlack
#define SKIN_PRIMARY GColorVividCerulean  // #00AAFF: textos y marcos
#define SKIN_ACCENT GColorElectricBlue    // #55FFFF: "G" y flechas de eventos

#define MARGIN 8
#define TOP_H 58
#define BOTTOM_H 64
#define PERSIST_KEY_EVENTS 2
#define PERSIST_KEY_GLUCOSE 3
#define PERSIST_KEY_RANGES 4
#define EVENTS_REFRESH_MIN 30
#define GLUCOSE_REFRESH_MIN 2
#define GLUCOSE_STALE_S (10 * 60)  // lectura más vieja que esto: "G ---"

static const char *const MONTHS[] = {
  "ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC",
};
static const char *const WEEKDAYS[] = {
  "DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB",
};

typedef struct {
  int32_t prev;  // inicio del evento anterior del calendario (Unix), 0 si no hay
  int32_t next;  // inicio del próximo evento
} Events;

typedef struct {
  int32_t value;  // mg/dL
  int32_t trend;  // 1 bajando rápido … 3 estable … 5 subiendo rápido, 0 sin dato
  int32_t time;   // momento de la lectura (Unix), 0 si no hay
} Glucose;

// Umbrales de color en mg/dL, configurables desde el teléfono.
typedef struct {
  int32_t red_low;      // por debajo: rojo
  int32_t target_low;   // objetivo (verde) desde…
  int32_t target_high;  // …hasta, inclusive
  int32_t red_high;     // por encima: rojo; entre objetivo y rojo: amarillo
} GlucoseRanges;

static Window *s_window;
static Layer *s_canvas;
static GFont s_font_time;
static GFont s_font_medium;
static GFont s_font_small;

static struct tm s_now;
static BatteryChargeState s_battery;
static Glucose s_glucose;
static GlucoseRanges s_ranges = { 50, 80, 130, 250 };
static Events s_events;

// ── Dibujo ────────────────────────────────────────────────────────────────────

static void draw_text(GContext *ctx, const char *text, GFont font, GRect box,
                      GTextAlignment align) {
  graphics_draw_text(ctx, text, font, box, GTextOverflowModeFill, align, NULL);
}

static void fill_triangle(GContext *ctx, GPoint a, GPoint b, GPoint c) {
  GPathInfo info = { .num_points = 3, .points = (GPoint[]) { a, b, c } };
  GPath *path = gpath_create(&info);
  gpath_draw_filled(ctx, path);
  gpath_destroy(path);
}

// Flecha de tendencia (TrendArrow 1..5 = ↓ ↘ → ↗ ↑). Se definen → y ↘ con coordenadas
// exactas y el resto se obtiene girando 90° o espejando: rotar un GPath tan chico a 45°
// lo deforma.
static void draw_trend_arrow(GContext *ctx, GPoint center, int trend) {
  static const GPoint STRAIGHT[7] = { {-8, -3}, {0, -3}, {0, -8}, {9, 0}, {0, 8}, {0, 3}, {-8, 3} };
  static const GPoint DIAGONAL[7] = { {-4, -8}, {3, -1}, {7, -5}, {7, 7}, {-5, 7}, {-1, 3}, {-8, -4} };
  const GPoint *shape = (trend == 2 || trend == 4) ? DIAGONAL : STRAIGHT;
  GPoint points[7];
  for (int i = 0; i < 7; i++) {
    int x = shape[i].x;
    int y = shape[i].y;
    switch (trend) {
      case 1:  points[i] = GPoint(center.x - y, center.y + x); break;  // ↓
      case 4:  points[i] = GPoint(center.x + x, center.y - y); break;  // ↗
      case 5:  points[i] = GPoint(center.x + y, center.y - x); break;  // ↑
      default: points[i] = GPoint(center.x + x, center.y + y); break;  // ↘ →
    }
  }
  GPathInfo info = { .num_points = 7, .points = points };
  GPath *path = gpath_create(&info);
  gpath_draw_filled(ctx, path);
  gpath_destroy(path);
}

static GColor glucose_color(int32_t value) {
  if (value < s_ranges.red_low || value > s_ranges.red_high) {
    return GColorRed;
  }
  if (value < s_ranges.target_low || value > s_ranges.target_high) {
    return GColorYellow;
  }
  return GColorGreen;
}

static bool glucose_is_fresh(void) {
  return s_glucose.time != 0 && time(NULL) - s_glucose.time <= GLUCOSE_STALE_S;
}

static void draw_date(GContext *ctx, GRect area) {
  char date[12];
  snprintf(date, sizeof(date), "%02d/%s", s_now.tm_mday, MONTHS[s_now.tm_mon]);
  int line_h = area.size.h / 2;
  draw_text(ctx, date, s_font_small,
            GRect(area.origin.x, area.origin.y, area.size.w, line_h), GTextAlignmentCenter);
  draw_text(ctx, WEEKDAYS[s_now.tm_wday], s_font_small,
            GRect(area.origin.x, area.origin.y + line_h, area.size.w, line_h),
            GTextAlignmentCenter);
}

static void draw_glucose(GContext *ctx, GRect area) {
  graphics_context_set_stroke_width(ctx, 2);
  graphics_draw_round_rect(ctx, area, 8);
  graphics_context_set_text_color(ctx, SKIN_ACCENT);
  draw_text(ctx, "G", s_font_small, GRect(area.origin.x + 6, area.origin.y + 10, 16, 28),
            GTextAlignmentLeft);
  graphics_context_set_text_color(ctx, SKIN_PRIMARY);

  bool fresh = glucose_is_fresh();
  char value[12];
  if (fresh) {
    snprintf(value, sizeof(value), "%d", (int)s_glucose.value);
    GColor color = glucose_color(s_glucose.value);
    graphics_context_set_text_color(ctx, color);
    graphics_context_set_fill_color(ctx, color);
  } else {
    strcpy(value, "---");
  }
  draw_text(ctx, value, s_font_medium,
            GRect(area.origin.x + 20, area.origin.y + 6, area.size.w - 44, 32),
            GTextAlignmentRight);

  if (fresh && s_glucose.trend >= 1 && s_glucose.trend <= 5) {
    draw_trend_arrow(ctx, GPoint(area.origin.x + area.size.w - 13,
                                 area.origin.y + area.size.h / 2), (int)s_glucose.trend);
  }
  graphics_context_set_text_color(ctx, SKIN_PRIMARY);
  graphics_context_set_fill_color(ctx, SKIN_PRIMARY);
}

static void draw_time(GContext *ctx, GRect area) {
  char time_str[6];
  strftime(time_str, sizeof(time_str), clock_is_24h_style() ? "%H:%M" : "%I:%M", &s_now);
  const char *text = (time_str[0] == '0') ? time_str + 1 : time_str;
  // El alto de línea de la fuente es mayor que las cifras: se sube el cuadro
  // para centrar ópticamente los dígitos en la zona.
  draw_text(ctx, text, s_font_time,
            GRect(area.origin.x - 10, area.origin.y + area.size.h / 2 - 52, area.size.w + 20, 80),
            GTextAlignmentCenter);
}

static void draw_battery(GContext *ctx, GRect area) {
  GRect body = GRect(area.origin.x + 4, area.origin.y + 6, area.size.w - 12, 26);
  graphics_context_set_stroke_width(ctx, 2);
  graphics_draw_round_rect(ctx, body, 3);
  graphics_fill_rect(ctx, GRect(body.origin.x + body.size.w, body.origin.y + 9, 4, 8), 1,
                     GCornersRight);

  GColor level_color = s_battery.charge_percent <= 20 ? GColorRed
                     : s_battery.charge_percent <= 40 ? GColorChromeYellow
                     : GColorGreen;
  int max_w = body.size.w - 8;
  graphics_context_set_fill_color(ctx, level_color);
  graphics_fill_rect(ctx, GRect(body.origin.x + 4, body.origin.y + 4,
                                max_w * s_battery.charge_percent / 100, body.size.h - 8),
                     0, GCornerNone);
  graphics_context_set_fill_color(ctx, SKIN_PRIMARY);

  char percent[8];
  snprintf(percent, sizeof(percent), "%d%%", s_battery.charge_percent);
  draw_text(ctx, percent, s_font_small,
            GRect(area.origin.x, area.origin.y + 32, area.size.w, 28), GTextAlignmentCenter);
}

// Mismo día: hora ("9:30"). Otro día: día de la semana ("MIÉ").
static void format_event(time_t start, char *buf, size_t size) {
  if (start == 0) {
    strcpy(buf, "--:--");
    return;
  }
  struct tm event = *localtime(&start);
  if (event.tm_yday != s_now.tm_yday || event.tm_year != s_now.tm_year) {
    strncpy(buf, WEEKDAYS[event.tm_wday], size);
    buf[size - 1] = '\0';
    return;
  }
  strftime(buf, size, clock_is_24h_style() ? "%H:%M" : "%I:%M", &event);
  if (buf[0] == '0') {
    memmove(buf, buf + 1, strlen(buf));
  }
}

static void draw_event_row(GContext *ctx, GRect row, time_t start, bool past) {
  int cx = row.origin.x + 5;
  int cy = row.origin.y + row.size.h / 2 + 2;
  graphics_context_set_fill_color(ctx, SKIN_ACCENT);
  if (past) {
    fill_triangle(ctx, GPoint(cx - 5, cy + 3), GPoint(cx + 5, cy + 3), GPoint(cx, cy - 3));
  } else {
    fill_triangle(ctx, GPoint(cx - 5, cy - 3), GPoint(cx + 5, cy - 3), GPoint(cx, cy + 3));
  }
  graphics_context_set_fill_color(ctx, SKIN_PRIMARY);
  char text[12];
  format_event(start, text, sizeof(text));
  draw_text(ctx, text, s_font_medium,
            GRect(row.origin.x + 12, row.origin.y - 4, row.size.w - 12, row.size.h + 4),
            GTextAlignmentRight);
}

static void draw_events(GContext *ctx, GRect area) {
  int row_h = area.size.h / 2;
  draw_event_row(ctx, GRect(area.origin.x, area.origin.y, area.size.w, row_h), s_events.prev,
                 true);
  draw_event_row(ctx, GRect(area.origin.x, area.origin.y + row_h, area.size.w, row_h),
                 s_events.next, false);
}

static void canvas_update_proc(Layer *layer, GContext *ctx) {
  GRect bounds = layer_get_bounds(layer);
  graphics_context_set_text_color(ctx, SKIN_PRIMARY);
  graphics_context_set_stroke_color(ctx, SKIN_PRIMARY);
  graphics_context_set_fill_color(ctx, SKIN_PRIMARY);

  graphics_context_set_stroke_width(ctx, 4);
  graphics_draw_round_rect(ctx, GRect(2, 2, bounds.size.w - 4, bounds.size.h - 4), 16);

  int inner_w = bounds.size.w - 2 * MARGIN;
  int bottom_y = bounds.size.h - MARGIN - BOTTOM_H;

  draw_date(ctx, GRect(MARGIN, MARGIN + 2, 78, TOP_H - 4));
  draw_glucose(ctx, GRect(MARGIN + 80, MARGIN + 4, inner_w - 84, 48));
  draw_time(ctx, GRect(MARGIN, MARGIN + TOP_H, inner_w, bottom_y - MARGIN - TOP_H));
  draw_battery(ctx, GRect(MARGIN + 4, bottom_y, 76, BOTTOM_H));
  draw_events(ctx, GRect(MARGIN + 88, bottom_y + 2, inner_w - 96, BOTTOM_H - 4));
}

// ── Datos ─────────────────────────────────────────────────────────────────────

// Un solo mensaje con lo que haga falta: no se puede enviar otro mientras uno está en curso.
static void request_data(bool glucose, bool events) {
  DictionaryIterator *iter;
  if ((!glucose && !events) || app_message_outbox_begin(&iter) != APP_MSG_OK) {
    return;
  }
  if (glucose) {
    dict_write_uint8(iter, MESSAGE_KEY_REQUEST_GLUCOSE, 1);
  }
  if (events) {
    dict_write_uint8(iter, MESSAGE_KEY_REQUEST_EVENTS, 1);
  }
  app_message_outbox_send();
}

static void tick_handler(struct tm *tick_time, TimeUnits units_changed) {
  s_now = *tick_time;
  // Cuando empieza el próximo evento pasa a ser el anterior (aunque no haya
  // teléfono); se pide el nuevo próximo y, periódicamente, por si cambió el calendario.
  bool next_started = s_events.next != 0 && time(NULL) >= s_events.next;
  if (next_started) {
    s_events.prev = s_events.next;
    s_events.next = 0;
    persist_write_data(PERSIST_KEY_EVENTS, &s_events, sizeof(s_events));
  }
  request_data(tick_time->tm_min % GLUCOSE_REFRESH_MIN == 0,
               next_started || tick_time->tm_min % EVENTS_REFRESH_MIN == 0);
  layer_mark_dirty(s_canvas);
}

static void battery_handler(BatteryChargeState state) {
  s_battery = state;
  layer_mark_dirty(s_canvas);
}

static void inbox_received_handler(DictionaryIterator *iter, void *context) {
  Tuple *prev = dict_find(iter, MESSAGE_KEY_PREV_EVENT);
  Tuple *next = dict_find(iter, MESSAGE_KEY_NEXT_EVENT);
  if (prev && next) {
    s_events.prev = prev->value->int32;
    s_events.next = next->value->int32;
    persist_write_data(PERSIST_KEY_EVENTS, &s_events, sizeof(s_events));
    layer_mark_dirty(s_canvas);
  }

  Tuple *value = dict_find(iter, MESSAGE_KEY_GLUCOSE);
  Tuple *trend = dict_find(iter, MESSAGE_KEY_GLUCOSE_TREND);
  Tuple *read_at = dict_find(iter, MESSAGE_KEY_GLUCOSE_TIME);
  if (value && trend && read_at) {
    s_glucose.value = value->value->int32;
    s_glucose.trend = trend->value->int32;
    s_glucose.time = read_at->value->int32;
    persist_write_data(PERSIST_KEY_GLUCOSE, &s_glucose, sizeof(s_glucose));
    layer_mark_dirty(s_canvas);
  }

  Tuple *red_low = dict_find(iter, MESSAGE_KEY_GLUCOSE_RED_LOW);
  Tuple *target_low = dict_find(iter, MESSAGE_KEY_GLUCOSE_TARGET_LOW);
  Tuple *target_high = dict_find(iter, MESSAGE_KEY_GLUCOSE_TARGET_HIGH);
  Tuple *red_high = dict_find(iter, MESSAGE_KEY_GLUCOSE_RED_HIGH);
  if (red_low && target_low && target_high && red_high) {
    s_ranges.red_low = red_low->value->int32;
    s_ranges.target_low = target_low->value->int32;
    s_ranges.target_high = target_high->value->int32;
    s_ranges.red_high = red_high->value->int32;
    persist_write_data(PERSIST_KEY_RANGES, &s_ranges, sizeof(s_ranges));
    layer_mark_dirty(s_canvas);
  }
}

// ── Ciclo de vida ─────────────────────────────────────────────────────────────

static void window_load(Window *window) {
  Layer *root = window_get_root_layer(window);
  s_canvas = layer_create(layer_get_bounds(root));
  layer_set_update_proc(s_canvas, canvas_update_proc);
  layer_add_child(root, s_canvas);
}

static void window_unload(Window *window) {
  layer_destroy(s_canvas);
}

static void init(void) {
  s_font_time = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_RUSSO_68));
  s_font_medium = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_RUSSO_26));
  s_font_small = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_RUSSO_20));

  time_t now = time(NULL);
  s_now = *localtime(&now);
  s_battery = battery_state_service_peek();
  if (persist_exists(PERSIST_KEY_EVENTS)) {
    persist_read_data(PERSIST_KEY_EVENTS, &s_events, sizeof(s_events));
  }
  if (persist_exists(PERSIST_KEY_GLUCOSE)) {
    persist_read_data(PERSIST_KEY_GLUCOSE, &s_glucose, sizeof(s_glucose));
  }
  if (persist_exists(PERSIST_KEY_RANGES)) {
    persist_read_data(PERSIST_KEY_RANGES, &s_ranges, sizeof(s_ranges));
  }

  s_window = window_create();
  window_set_background_color(s_window, SKIN_BACKGROUND);
  window_set_window_handlers(s_window, (WindowHandlers) {
    .load = window_load,
    .unload = window_unload,
  });
  window_stack_push(s_window, true);

  tick_timer_service_subscribe(MINUTE_UNIT, tick_handler);
  battery_state_service_subscribe(battery_handler);
  app_message_register_inbox_received(inbox_received_handler);
  app_message_open(64, 32);
}

static void deinit(void) {
  tick_timer_service_unsubscribe();
  battery_state_service_unsubscribe();
  app_message_deregister_callbacks();
  window_destroy(s_window);
  fonts_unload_custom_font(s_font_time);
  fonts_unload_custom_font(s_font_medium);
  fonts_unload_custom_font(s_font_small);
}

int main(void) {
  init();
  app_event_loop();
  deinit();
}
