<?php
/*
 * MikoPBX - free phone system for small business
 * Copyright © 2017-2023 Alexey Portnov and Nikolay Beketov
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with this program.
 * If not, see <https://www.gnu.org/licenses/>.
 */

namespace Modules\ModuleCTIClient\Lib;

/**
 * Нормализация выбранного типа CRM (настройка crm_type).
 *
 * Правило живёт в Lib, а не в модели: после обновления файлов модуля
 * долгоживущий PHP-воркер (WorkerApiCommands и т.п.) может ещё долго держать
 * в памяти класс модели, загруженный до обновления, — без новых методов и
 * констант. Обращение к ним из нового кода Lib падает фатально (инцидент
 * версии 1.609: "The method 'isCrm1cType' doesn't exist on model"). Новый
 * класс воркер всегда загружает с диска в актуальной версии.
 */
class CrmTypes
{
    public const TYPE_1C = '1c';

    /**
     * Выбрана ли интеграция с 1С. Единая точка нормализации crm_type:
     * легаси-записи с null/'' (колонка появилась позже) считаются '1c';
     * любой будущий тип CRM держит стек 1С выключенным.
     */
    public static function isCrm1c(?string $crmType): bool
    {
        return $crmType === null || $crmType === '' || $crmType === self::TYPE_1C;
    }
}
