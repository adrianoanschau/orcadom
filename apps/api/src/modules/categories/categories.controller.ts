import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { CategoriesService } from './categories.service.js';
import {
  CategoryParams,
  CreateCategoryBody,
  ListCategoriesQueryDto,
  UpdateCategoryBody,
} from './categories.dto.js';

@ApiTags('categories')
@ApiCookieAuth('accessToken')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Post()
  create(@CurrentUser() userId: string, @Body() body: CreateCategoryBody) {
    return this.categories.create(userId, body);
  }

  @Get()
  list(@CurrentUser() userId: string, @Query() query: ListCategoriesQueryDto) {
    return this.categories.list(userId, query);
  }

  @Patch(':id')
  update(
    @CurrentUser() userId: string,
    @Param() params: CategoryParams,
    @Body() body: UpdateCategoryBody,
  ) {
    return this.categories.update(userId, params.id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() userId: string, @Param() params: CategoryParams): Promise<void> {
    return this.categories.remove(userId, params.id);
  }
}
