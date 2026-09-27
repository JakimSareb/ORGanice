;;; organice-calendar.el --- ORGanice: calendario como el de la app  -*- lexical-binding: t; -*-

;; `M-x calendar' (o C-c g C, o la paleta) con lo mismo que el calendario de ORGanice:
;; lunes primero, nombres en español, número de semana ISO, festivos de España (nacionales y
;; de tu comunidad; los de 2026 según el BOE, el resto aproximados), tus festivos propios y
;; las fases de la Luna.
;;
;; En el calendario: RET (o c) la agenda de ese día, < > meses, C-x [ ] años, . hoy,
;; g d ir a una fecha, h festivo del día,
;; x marcar festivos, M fases de la Luna, M-= contar los días de la región (marca con C-SPC).

(require 'calendar)
(require 'holidays)
(require 'lunar)
(require 'cl-lib)

(defcustom organice-calendar-region nil
  "Comunidad autónoma para los festivos (como en la app): nil (solo nacionales), \"AN\",
\"AR\", \"AS\", \"IB\", \"CN\", \"CB\", \"CM\", \"CL\", \"CT\", \"VC\", \"EX\", \"GA\", \"MD\", \"MC\",
\"NC\", \"PV\", \"RI\", \"CE\" o \"ML\"."
  :type '(choice (const :tag "Solo nacionales" nil) string)
  :group 'organice)

(defcustom organice-calendar-custom-holidays nil
  "Festivos propios: lista de (MES DÍA NOMBRE) para todos los años o (MES DÍA AÑO NOMBRE)."
  :type '(repeat sexp)
  :group 'organice)

;;;; Español, lunes primero, semanas ISO ------------------------------------------------------

(setq calendar-week-start-day 1
      calendar-date-style 'european
      calendar-day-name-array ["domingo" "lunes" "martes" "miércoles" "jueves" "viernes" "sábado"]
      calendar-day-abbrev-array ["dom" "lun" "mar" "mié" "jue" "vie" "sáb"]
      calendar-day-header-array ["do" "lu" "ma" "mi" "ju" "vi" "sá"]
      calendar-month-name-array ["enero" "febrero" "marzo" "abril" "mayo" "junio" "julio"
                                 "agosto" "septiembre" "octubre" "noviembre" "diciembre"]
      calendar-month-abbrev-array ["ene" "feb" "mar" "abr" "may" "jun" "jul" "ago" "sep"
                                   "oct" "nov" "dic"]
      calendar-mark-holidays-flag t
      lunar-phase-names '("Luna nueva" "Cuarto creciente" "Luna llena" "Cuarto menguante"))

(setq calendar-intermonth-header (propertize "sem" 'font-lock-face 'font-lock-comment-face)
      calendar-intermonth-text
      '(propertize
        (format "%2d" (car (calendar-iso-from-absolute
                            (calendar-absolute-from-gregorian (list month day year)))))
        'font-lock-face 'font-lock-comment-face))

;;;; Festivos (las mismas tablas que la app: src/lib/eli_holidays.js) -------------------------

(defun organice--easter (year)
  "Domingo de Pascua de YEAR como (MES DÍA AÑO)."
  (let* ((a (% year 19)) (b (/ year 100)) (c (% year 100)) (d (/ b 4)) (e (% b 4))
         (f (/ (+ b 8) 25)) (g (/ (+ (- b f) 1) 3))
         (h (% (+ (* 19 a) (- b d g) 15) 30)) (i (/ c 4)) (k (% c 4))
         (l (% (- (+ 32 (* 2 e) (* 2 i)) h k) 7)) (m (/ (+ a (* 11 h) (* 22 l)) 451))
         (n (+ h l (* -7 m) 114)))
    (list (/ n 31) (1+ (% n 31)) year)))

(defun organice--easter-offset (year days)
  (calendar-gregorian-from-absolute
   (+ days (calendar-absolute-from-gregorian (organice--easter year)))))

(defconst organice--holidays-2026
  '((national (1 1 "Año Nuevo") (1 6 "Epifanía del Señor") (4 3 "Viernes Santo")
              (5 1 "Fiesta del Trabajo") (8 15 "Asunción de la Virgen")
              (10 12 "Fiesta Nacional de España") (11 1 "Todos los Santos (domingo)")
              (12 6 "Día de la Constitución (domingo)") (12 8 "Inmaculada Concepción")
              (12 25 "Natividad del Señor"))
    ("AN" (2 28 "Día de Andalucía") (4 2 "Jueves Santo") (11 2 "Lunes siguiente a Todos los Santos") (12 7 "Lunes siguiente al Día de la Constitución"))
    ("AR" (4 2 "Jueves Santo") (4 23 "San Jorge, Día de Aragón") (11 2 "Lunes siguiente a Todos los Santos") (12 7 "Lunes siguiente al Día de la Constitución"))
    ("AS" (4 2 "Jueves Santo") (9 8 "Día de Asturias") (11 2 "Lunes siguiente a Todos los Santos") (12 7 "Lunes siguiente al Día de la Constitución"))
    ("IB" (3 2 "Lunes siguiente al Día de les Illes Balears") (4 2 "Jueves Santo") (4 6 "Lunes de Pascua") (12 26 "Sant Esteve"))
    ("CN" (4 2 "Jueves Santo") (5 30 "Día de Canarias") (11 2 "Lunes siguiente a Todos los Santos"))
    ("CB" (4 2 "Jueves Santo") (7 28 "Día de las Instituciones de Cantabria") (9 15 "La Bien Aparecida") (12 7 "Lunes siguiente al Día de la Constitución"))
    ("CM" (4 2 "Jueves Santo") (4 6 "Lunes de Pascua") (6 4 "Corpus Christi") (11 2 "Lunes siguiente a Todos los Santos"))
    ("CL" (4 2 "Jueves Santo") (4 23 "Fiesta de Castilla y León") (11 2 "Lunes siguiente a Todos los Santos") (12 7 "Lunes siguiente al Día de la Constitución"))
    ("CT" (4 6 "Lunes de Pascua") (6 24 "Sant Joan") (9 11 "Diada Nacional de Catalunya") (12 26 "Sant Esteve"))
    ("VC" (3 19 "San José") (4 6 "Lunes de Pascua") (6 24 "San Juan") (10 9 "Día de la Comunitat Valenciana"))
    ("EX" (4 2 "Jueves Santo") (9 8 "Día de Extremadura") (11 2 "Lunes siguiente a Todos los Santos") (12 7 "Lunes siguiente al Día de la Constitución"))
    ("GA" (3 19 "San José") (4 2 "Jueves Santo") (6 24 "San Juan") (7 25 "Día Nacional de Galicia"))
    ("MD" (4 2 "Jueves Santo") (5 2 "Fiesta de la Comunidad de Madrid") (11 2 "Lunes siguiente a Todos los Santos") (12 7 "Lunes siguiente al Día de la Constitución"))
    ("MC" (3 19 "San José") (4 2 "Jueves Santo") (6 9 "Día de la Región de Murcia") (12 7 "Lunes siguiente al Día de la Constitución"))
    ("NC" (3 19 "San José") (4 2 "Jueves Santo") (4 6 "Lunes de Pascua") (11 2 "Lunes siguiente a Todos los Santos"))
    ("PV" (3 19 "San José") (4 2 "Jueves Santo") (4 6 "Lunes de Pascua") (7 25 "Santiago Apóstol"))
    ("RI" (4 2 "Jueves Santo") (4 6 "Lunes de Pascua") (6 9 "Día de La Rioja") (12 7 "Lunes siguiente al Día de la Constitución"))
    ("CE" (4 2 "Jueves Santo") (5 27 "Eid al-Adha") (8 5 "Nuestra Señora de África") (9 2 "Día de Ceuta"))
    ("ML" (3 20 "Eid al-Fitr") (4 2 "Jueves Santo") (5 27 "Eid al-Adha") (12 7 "Lunes siguiente al Día de la Constitución")))
  "Festivos de 2026 según el BOE (BOE-A-2025-21667).")

(defun organice--holiday-rules (year region)
  "Festivos aproximados de YEAR (años sin tabla del BOE): lista de ((M D Y) NOMBRE)."
  (let* ((js (list (organice--easter-offset year -3) "Jueves Santo"))
         (lp (list (organice--easter-offset year 1) "Lunes de Pascua"))
         (fx (lambda (m d name) (list (list m d year) name)))
         (national
          (list (funcall fx 1 1 "Año Nuevo") (funcall fx 1 6 "Epifanía del Señor")
                (list (organice--easter-offset year -2) "Viernes Santo")
                (funcall fx 5 1 "Fiesta del Trabajo") (funcall fx 8 15 "Asunción de la Virgen")
                (funcall fx 10 12 "Fiesta Nacional de España") (funcall fx 11 1 "Todos los Santos")
                (funcall fx 12 6 "Día de la Constitución") (funcall fx 12 8 "Inmaculada Concepción")
                (funcall fx 12 25 "Natividad del Señor")))
         (regional
          (pcase region
            ("AN" (list (funcall fx 2 28 "Día de Andalucía") js))
            ("AR" (list js (funcall fx 4 23 "San Jorge, Día de Aragón")))
            ("AS" (list js (funcall fx 9 8 "Día de Asturias")))
            ("IB" (list (funcall fx 3 1 "Día de les Illes Balears") js lp (funcall fx 12 26 "Sant Esteve")))
            ("CN" (list js (funcall fx 5 30 "Día de Canarias")))
            ("CB" (list js (funcall fx 7 28 "Día de las Instituciones de Cantabria") (funcall fx 9 15 "La Bien Aparecida")))
            ("CM" (list js (funcall fx 5 31 "Día de Castilla-La Mancha")))
            ("CL" (list js (funcall fx 4 23 "Fiesta de Castilla y León")))
            ("CT" (list lp (funcall fx 6 24 "Sant Joan") (funcall fx 9 11 "Diada Nacional de Catalunya") (funcall fx 12 26 "Sant Esteve")))
            ("VC" (list (funcall fx 3 19 "San José") lp (funcall fx 10 9 "Día de la Comunitat Valenciana")))
            ("EX" (list js (funcall fx 9 8 "Día de Extremadura")))
            ("GA" (list js (funcall fx 5 17 "Día de las Letras Gallegas") (funcall fx 7 25 "Día Nacional de Galicia")))
            ("MD" (list js (funcall fx 5 2 "Fiesta de la Comunidad de Madrid")))
            ("MC" (list js (funcall fx 6 9 "Día de la Región de Murcia")))
            ("NC" (list js lp (funcall fx 12 3 "San Francisco Javier")))
            ("PV" (list js lp))
            ("RI" (list js lp (funcall fx 6 9 "Día de La Rioja")))
            ("CE" (list js (funcall fx 8 5 "Nuestra Señora de África") (funcall fx 9 2 "Día de Ceuta")))
            ("ML" (list js (funcall fx 9 17 "Día de Melilla"))))))
    (append national regional)))

(defun organice-holidays-for-year (year &optional region)
  "Festivos de YEAR para REGION (por defecto `organice-calendar-region')."
  (let* ((region (or region organice-calendar-region))
         (base
          (if (= year 2026)
              (mapcar (lambda (h) (list (list (nth 0 h) (nth 1 h) year) (nth 2 h)))
                      (append (alist-get 'national organice--holidays-2026)
                              (and region (cdr (assoc region organice--holidays-2026)))))
            (organice--holiday-rules year region)))
         (custom
          (delq nil
                (mapcar (lambda (h)
                          (pcase h
                            (`(,m ,d ,(and y (pred integerp)) ,name)
                             (and (= y year) (list (list m d year) name)))
                            (`(,m ,d ,name) (list (list m d year) name))))
                        organice-calendar-custom-holidays))))
    (append base custom)))

(defun organice-calendar--visible-holidays ()
  "Festivos de los meses que se ven en el calendario."
  (let (res)
    (dolist (y (delete-dups (list (1- displayed-year) displayed-year (1+ displayed-year))))
      (dolist (h (organice-holidays-for-year y))
        (when (calendar-date-is-visible-p (car h)) (push h res))))
    (nreverse res)))

;; Solo nuestros festivos (sin los de EE. UU. que trae Emacs), y las fases de la Luna
(setq calendar-holidays '((organice-calendar--visible-holidays)))

;; Como en la app: RET (o c) en un día abre la agenda de ese día
(defun organice-calendar-agenda-for-date ()
  "Abre la agenda del día que está bajo el cursor en el calendario."
  (interactive)
  (let* ((date (calendar-cursor-to-date t)))
    (require 'org-agenda)
    (org-agenda-list nil (calendar-absolute-from-gregorian date) 'day)))
(with-eval-after-load 'calendar
  (define-key calendar-mode-map (kbd "RET") #'organice-calendar-agenda-for-date)
  (define-key calendar-mode-map (kbd "c") #'organice-calendar-agenda-for-date))

(defun organice-calendar ()
  "Abre el calendario (como el de la app)."
  (interactive)
  (calendar))

(provide 'organice-calendar)
;;; organice-calendar.el ends here
