#include <pebble.h>

// Watchface para Pebble Time 2 (emery, 200x228). Diseño inspirado en
// "Typical Outdoor" de rukari/@hidea; código propio.
//
//  ┌──────────────────────────────┐
//  │  14/SEP      ┌────────────┐  │  zona superior: fecha + pulso
//  │    LUN       │  ♥   72    │  │
//  │              └────────────┘  │
//  │           17:29              │  zona central: hora
//  │  ┌──────┐     ▲  9:30        │  zona inferior: batería + eventos
//  │  └──────┘     ▼ 11:00        │  (▲ anterior, ▼ próximo, como el Timeline)
//  │    87%                       │
//  └──────────────────────────────┘

#define MARGIN 8
#define TOP_H 58
#define BOTTOM_H 64
#define PERSIST_KEY_EVENTS 2
#define EVENTS_REFRESH_MIN 30
#define NO_DATA -1

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

static Window *s_window;
static Layer *s_canvas;
static GFont s_font_time;
static GFont s_font_medium;
static GFont s_font_small;

static struct tm s_now;
static BatteryChargeState s_battery;
static int s_heart_rate = NO_DATA;
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

static void draw_heart(GContext *ctx, GPoint center) {
  graphics_fill_circle(ctx, GPoint(center.x - 4, center.y - 3), 4);
  graphics_fill_circle(ctx, GPoint(center.x + 4, center.y - 3), 4);
  fill_triangle(ctx, GPoint(center.x - 8, center.y - 1), GPoint(center.x + 8, center.y - 1),
                GPoint(center.x, center.y + 8));
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

static void draw_heart_rate(GContext *ctx, GRect area) {
  graphics_context_set_stroke_width(ctx, 2);
  graphics_draw_round_rect(ctx, area, 8);
  draw_heart(ctx, GPoint(area.origin.x + 18, area.origin.y + area.size.h / 2 + 1));

  char bpm[12];
  if (s_heart_rate > 0) {
    snprintf(bpm, sizeof(bpm), "%d", s_heart_rate);
  } else {
    strcpy(bpm, "--");
  }
  draw_text(ctx, bpm, s_font_medium,
            GRect(area.origin.x + 30, area.origin.y + 6, area.size.w - 38, 32),
            GTextAlignmentRight);
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
  graphics_context_set_fill_color(ctx, GColorWhite);

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
  if (past) {
    fill_triangle(ctx, GPoint(cx - 5, cy + 3), GPoint(cx + 5, cy + 3), GPoint(cx, cy - 3));
  } else {
    fill_triangle(ctx, GPoint(cx - 5, cy - 3), GPoint(cx + 5, cy - 3), GPoint(cx, cy + 3));
  }
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
  graphics_context_set_text_color(ctx, GColorWhite);
  graphics_context_set_stroke_color(ctx, GColorWhite);
  graphics_context_set_fill_color(ctx, GColorWhite);

  graphics_context_set_stroke_width(ctx, 4);
  graphics_draw_round_rect(ctx, GRect(2, 2, bounds.size.w - 4, bounds.size.h - 4), 16);

  int inner_w = bounds.size.w - 2 * MARGIN;
  int bottom_y = bounds.size.h - MARGIN - BOTTOM_H;

  draw_date(ctx, GRect(MARGIN, MARGIN + 2, 86, TOP_H - 4));
  draw_heart_rate(ctx, GRect(MARGIN + 88, MARGIN + 4, inner_w - 92, 48));
  draw_time(ctx, GRect(MARGIN, MARGIN + TOP_H, inner_w, bottom_y - MARGIN - TOP_H));
  draw_battery(ctx, GRect(MARGIN + 4, bottom_y, 76, BOTTOM_H));
  draw_events(ctx, GRect(MARGIN + 88, bottom_y + 2, inner_w - 96, BOTTOM_H - 4));
}

// ── Datos ─────────────────────────────────────────────────────────────────────

static void request_events(void) {
  DictionaryIterator *iter;
  if (app_message_outbox_begin(&iter) == APP_MSG_OK) {
    dict_write_uint8(iter, MESSAGE_KEY_REQUEST_EVENTS, 1);
    app_message_outbox_send();
  }
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
  if (next_started || tick_time->tm_min % EVENTS_REFRESH_MIN == 0) {
    request_events();
  }
  layer_mark_dirty(s_canvas);
}

static void battery_handler(BatteryChargeState state) {
  s_battery = state;
  layer_mark_dirty(s_canvas);
}

static void update_heart_rate(void) {
  time_t now = time(NULL);
  if (health_service_metric_accessible(HealthMetricHeartRateBPM, now, now) &
      HealthServiceAccessibilityMaskAvailable) {
    s_heart_rate = (int)health_service_peek_current_value(HealthMetricHeartRateBPM);
  }
}

static void health_handler(HealthEventType event, void *context) {
  if (event == HealthEventHeartRateUpdate) {
    update_heart_rate();
    layer_mark_dirty(s_canvas);
  }
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
  update_heart_rate();
  if (persist_exists(PERSIST_KEY_EVENTS)) {
    persist_read_data(PERSIST_KEY_EVENTS, &s_events, sizeof(s_events));
  }

  s_window = window_create();
  window_set_background_color(s_window, GColorBlack);
  window_set_window_handlers(s_window, (WindowHandlers) {
    .load = window_load,
    .unload = window_unload,
  });
  window_stack_push(s_window, true);

  tick_timer_service_subscribe(MINUTE_UNIT, tick_handler);
  battery_state_service_subscribe(battery_handler);
  health_service_events_subscribe(health_handler, NULL);
  app_message_register_inbox_received(inbox_received_handler);
  app_message_open(64, 32);
}

static void deinit(void) {
  tick_timer_service_unsubscribe();
  battery_state_service_unsubscribe();
  health_service_events_unsubscribe();
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
