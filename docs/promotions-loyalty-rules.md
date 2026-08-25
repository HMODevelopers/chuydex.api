# Reglas de promociones y lealtad

Las promociones de descuento se aplican al confirmar la venta. `COMPRA_N_LLEVA_M` interpreta N como unidades pagadas y M como unidades gratuitas: con 7/1, 6 y 7 unidades no descuentan; 8 y 14 descuentan una unidad; 16 descuentan dos. Cuando participan varios productos elegibles, las unidades gratuitas se asignan primero al de menor precio. `DESCUENTO_PORCENTAJE` y `DESCUENTO_MONTO` se aplican a cada unidad elegible; el monto nunca puede reducir una línea por debajo de cero.

`LEALTAD` no descuenta en la venta. Acumula únicamente ventas completas de clientes registrados y genera una recompensa al completar cada ciclo de `cantidadObjetivo`. La recompensa queda ligada a la venta que completó el ciclo, conserva una evidencia de la regla vigente y se canjea en una venta de total cero, con salida de inventario y usuario responsable.

Una venta cancelada revierte sus eventos de lealtad y cancela las recompensas disponibles que dejen de estar respaldadas. Si la reversión invalidaría una recompensa ya canjeada, la cancelación de venta se rechaza íntegramente. Esto evita el estado inválido de venta cancelada con una recompensa válida obtenida gracias a ella.
